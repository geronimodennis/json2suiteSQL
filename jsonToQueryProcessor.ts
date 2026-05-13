/**
 * Query object accepted by jsonToSuiteQL.
 *
 * SuiteQL is read-only in this library: the processor renders SELECT query
 * specifications only. DML and schema-changing statements are intentionally
 * rejected at the top level.
 */
export interface JsonToSuiteQLQuery {
    with?: CteInput;
    distinct?: boolean;
    all?: boolean;
    select?: QueryObject | string[] | string;
    from?: QueryObject | string;
    where?: ConditionInput;
    startWith?: ConditionInput;
    connectBy?: ConditionInput;
    groupBy?: ClauseListInput;
    having?: ConditionInput;
    window?: QueryObject | string[];
    qualify?: ConditionInput;
    orderBy?: ClauseListInput;
    offset?: number | string;
    fetch?: number | string | FetchInput;
    limit?: number | string;
    union?: Array<JsonToSuiteQLQuery | string>;
    unionAll?: Array<JsonToSuiteQLQuery | string>;
    intersect?: Array<JsonToSuiteQLQuery | string>;
    intersectAll?: Array<JsonToSuiteQLQuery | string>;
    minus?: Array<JsonToSuiteQLQuery | string>;
    minusAll?: Array<JsonToSuiteQLQuery | string>;
    except?: Array<JsonToSuiteQLQuery | string>;
    exceptAll?: Array<JsonToSuiteQLQuery | string>;
    as?: string;
    on?: string;
    gate?: string;
    [key: string]: any;
}

export type SuiteQLParamValue = string | number | boolean | null | Date;
export type SuiteQLNamedParamValue = SuiteQLParamValue | SuiteQLParamValue[];
export type SuiteQLNamedParams = Record<string, SuiteQLNamedParamValue>;
export type SuiteQLParamInput = SuiteQLNamedParams | SuiteQLParamValue[];

export interface SuiteQLPreparedQuery {
    query: string;
    params: SuiteQLParamValue[];
    paramNames: string[];
}

type QueryObject = Record<string, any>;
type ConditionInput = QueryObject | string | string[];
type ClauseListInput = string | Array<string | QueryObject> | QueryObject;
type CteInput = QueryObject | CteItem[];

interface CteItem {
    name: string;
    query: JsonToSuiteQLQuery | string;
    columns?: string[];
}

interface FetchInput {
    rows?: number | string;
    percent?: boolean;
    withTies?: boolean;
}

type SetOperator = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'INTERSECT ALL' | 'MINUS' | 'MINUS ALL' | 'EXCEPT' | 'EXCEPT ALL';

const JOIN_TYPES: Record<string, string> = {
    JOIN: 'LEFT JOIN',
    PLAINJOIN: 'JOIN',
    STANDARDJOIN: 'JOIN',
    LEFTJOIN: 'LEFT JOIN',
    LEFTOUTERJOIN: 'LEFT OUTER JOIN',
    RIGHTJOIN: 'RIGHT JOIN',
    RIGHTOUTERJOIN: 'RIGHT OUTER JOIN',
    INNERJOIN: 'INNER JOIN',
    OUTERJOIN: 'OUTER JOIN',
    FULLJOIN: 'FULL JOIN',
    FULLOUTERJOIN: 'FULL OUTER JOIN',
    CROSSJOIN: 'CROSS JOIN',
    NATURALJOIN: 'NATURAL JOIN'
};

const READ_ONLY_BLOCKED_KEYS = new Set([
    'ADD',
    'ALTER',
    'CREATE',
    'DELETE',
    'DROP',
    'EDIT',
    'INSERT',
    'MERGE',
    'REMOVE',
    'TRUNCATE',
    'UPDATE',
    'UPSERT'
]);

export {jsonToSuiteQL, jsonToSuiteQLWithParams, namedParam, prepareSuiteQL};

function jsonToSuiteQL(jsonQuery: JsonToSuiteQLQuery = {}): string {
    if (!isObject(jsonQuery)) return '';

    assertReadOnlyQuery(jsonQuery);

    const hasSetOperators = hasAnySetOperator(jsonQuery);
    const withClause = withProcessor(jsonQuery.with);
    const queryBlock = queryBlockProcessor(jsonQuery, !hasSetOperators);
    const setQuery = setOperatorProcessor(queryBlock, jsonQuery);
    const finalClauses = hasSetOperators ? finalClauseProcessor(jsonQuery) : '';

    return normalizeWhitespace([withClause, setQuery || queryBlock, finalClauses].filter(Boolean).join(' '));
}

function jsonToSuiteQLWithParams(jsonQuery: JsonToSuiteQLQuery = {}, params: SuiteQLParamInput = {}): SuiteQLPreparedQuery {
    return prepareSuiteQL(jsonToSuiteQL(jsonQuery), params);
}

function prepareSuiteQL(query: string, params: SuiteQLParamInput = {}): SuiteQLPreparedQuery {
    if (Array.isArray(params)) {
        return {query, params: [...params], paramNames: []};
    }

    const prepared = convertNamedParamsToPositional(query, params);
    return prepared;
}

function namedParam(name: string): string {
    if (!isValidParamName(name)) {
        throw new Error(`Invalid SuiteQL parameter name "${name}". Use letters, numbers, and underscores, starting with a letter or underscore.`);
    }

    return `:${name}`;
}

function queryBlockProcessor(jsonQuery: JsonToSuiteQLQuery, includeFinalClauses: boolean): string {
    const queryString: string[] = [];
    const select = selectProcessor(jsonQuery.select, jsonQuery);
    const from = fromProcessor(jsonQuery.from);
    const where = conditionProcessor(jsonQuery.where);
    const startWith = conditionProcessor(jsonQuery.startWith);
    const connectBy = conditionProcessor(jsonQuery.connectBy);
    const groupBy = clauseListProcessor(jsonQuery.groupBy);
    const having = conditionProcessor(jsonQuery.having);
    const window = windowProcessor(jsonQuery.window);
    const qualify = conditionProcessor(jsonQuery.qualify);

    if (select) queryString.push('SELECT', select);
    if (from) queryString.push('FROM', from);
    if (where) queryString.push('WHERE', where);
    if (startWith) queryString.push('START WITH', startWith);
    if (connectBy) queryString.push('CONNECT BY', connectBy);
    if (groupBy) queryString.push('GROUP BY', groupBy);
    if (having) queryString.push('HAVING', having);
    if (window) queryString.push('WINDOW', window);
    if (qualify) queryString.push('QUALIFY', qualify);

    if (includeFinalClauses) {
        const finalClauses = finalClauseProcessor(jsonQuery);
        if (finalClauses) queryString.push(finalClauses);
    }

    return queryString.join(' ');
}

function selectProcessor(select: JsonToSuiteQLQuery['select'], query: JsonToSuiteQLQuery): string {
    if (!select) return '';

    const modifier = query.distinct ? 'DISTINCT ' : query.all ? 'ALL ' : '';

    if (typeof select === 'string') return modifier + select.trim();
    if (Array.isArray(select)) return modifier + select.join(', ');
    if (!isObject(select)) return '';

    const columns = Object.keys(select)
        .map((fieldName) => selectItemProcessor(fieldName, select[fieldName]))
        .filter(Boolean);

    return modifier + columns.join(', ');
}

function selectItemProcessor(fieldName: string, fieldInfo: any): string {
    const key = normalizeKey(fieldName);

    if (key.startsWith('EXPRESSION')) {
        return selectExpressionProcessor(fieldName, fieldInfo);
    }

    if (key.startsWith('SUBQUERY')) {
        return subqueryExpressionProcessor(fieldInfo);
    }

    if (isObject(fieldInfo)) {
        const expression = util_IdentifyObjectRelName(fieldInfo) || fieldName;
        return renderExpressionWithAlias(renderAnalyticExpression(expression, fieldInfo), fieldInfo.as);
    }

    if (typeof fieldInfo === 'string') return `${fieldName} ${fieldInfo}`.trim();
    return fieldName;
}

function selectExpressionProcessor(fieldName: string, fieldInfo: any): string {
    if (isObject(fieldInfo)) {
        const expression = util_IdentifyObjectRelName(fieldInfo) || fieldName;
        return renderExpressionWithAlias(renderAnalyticExpression(expression, fieldInfo), fieldInfo.as);
    }

    return String(fieldInfo);
}

function subqueryExpressionProcessor(fieldInfo: any): string {
    const query = isObject(fieldInfo) && Object.prototype.hasOwnProperty.call(fieldInfo, 'query') ? fieldInfo.query : fieldInfo;
    const alias = isObject(fieldInfo) ? fieldInfo.as : '';
    return renderExpressionWithAlias(`(${renderQueryInput(query)})`, alias);
}

function renderAnalyticExpression(expression: string, fieldInfo: QueryObject): string {
    if (!Object.prototype.hasOwnProperty.call(fieldInfo, 'over')) return expression;
    return `${expression} ${overProcessor(fieldInfo.over)}`;
}

function fromProcessor(from: JsonToSuiteQLQuery['from']): string {
    if (!from) return '';
    if (typeof from === 'string') return from.trim();
    if (!isObject(from)) return '';

    const tableCollection: string[] = [];
    const tableJoinCollection: string[] = [];

    for (const tableName in from) {
        const tableInfo = from[tableName];
        const key = normalizeKey(tableName);

        if (key.startsWith('EXPRESSION')) {
            tableCollection.push(isObject(tableInfo) ? util_IdentifyObjectRelName(tableInfo) : String(tableInfo));
        } else if (key.startsWith('SUBQUERY')) {
            tableCollection.push(fromSubqueryProcessor(tableInfo));
        } else if (JOIN_TYPES[key]) {
            tableJoinCollection.push(...joinProcessor(JOIN_TYPES[key], tableInfo));
        } else if (isObject(tableInfo)) {
            const table = [util_IdentifyObjectRelName(tableInfo) || tableName];
            if (tableInfo.as) table.push('as', tableInfo.as);
            tableCollection.push(table.join(' '));
        } else if (typeof tableInfo === 'string') {
            tableCollection.push(`${tableName} ${tableInfo}`.trim());
        } else {
            tableCollection.push(tableName);
        }
    }

    return [tableCollection.join(', '), tableJoinCollection.join(' ')].filter(Boolean).join(' ');
}

function fromSubqueryProcessor(tableInfo: any): string {
    const query = isObject(tableInfo) && Object.prototype.hasOwnProperty.call(tableInfo, 'query') ? tableInfo.query : tableInfo;
    const table = [`(${renderQueryInput(query)})`];
    if (isObject(tableInfo) && tableInfo.as) table.push('as', tableInfo.as);
    return table.join(' ');
}

function joinProcessor(joinType: string, join: any): string[] {
    if (!join) return [];
    if (typeof join === 'string') return [`${joinType} ${join}`];
    if (!isObject(join)) return [];

    const tableCollection: string[] = [];

    for (const tableName in join) {
        const tableInfo = join[tableName];
        const key = normalizeKey(tableName);

        if (key.startsWith('EXPRESSION')) {
            tableCollection.push(joinExpressionProcessor(joinType, tableInfo));
        } else if (key.startsWith('SUBQUERY')) {
            tableCollection.push(joinSubqueryProcessor(joinType, tableInfo));
        } else if (isObject(tableInfo)) {
            const table = [joinType, util_IdentifyObjectRelName(tableInfo) || tableName];
            if (tableInfo.as) table.push('as', tableInfo.as);
            if (tableInfo.on) table.push('ON', tableInfo.on);
            if (tableInfo.using) table.push('USING', renderUsingClause(tableInfo.using));
            tableCollection.push(table.join(' '));
        } else if (typeof tableInfo === 'string') {
            tableCollection.push(`${joinType} ${tableName} ${tableInfo}`.trim());
        }
    }

    return tableCollection;
}

function joinExpressionProcessor(joinType: string, tableInfo: any): string {
    if (!isObject(tableInfo)) return String(tableInfo);

    const table = [joinType];
    if (tableInfo.table) table.push(tableInfo.table);
    if (tableInfo.expression) table.push(tableInfo.expression);
    if (tableInfo.as) table.push('as', tableInfo.as);
    if (tableInfo.on) table.push('ON', tableInfo.on);
    if (tableInfo.using) table.push('USING', renderUsingClause(tableInfo.using));
    return table.join(' ');
}

function joinSubqueryProcessor(joinType: string, tableInfo: any): string {
    const query = isObject(tableInfo) && Object.prototype.hasOwnProperty.call(tableInfo, 'query') ? tableInfo.query : tableInfo;
    const table = [joinType, `(${renderQueryInput(query)})`];
    if (isObject(tableInfo) && tableInfo.as) table.push('as', tableInfo.as);
    if (isObject(tableInfo) && tableInfo.on) table.push('ON', tableInfo.on);
    if (isObject(tableInfo) && tableInfo.using) table.push('USING', renderUsingClause(tableInfo.using));
    return table.join(' ');
}

function conditionProcessor(condition?: ConditionInput): string {
    if (!condition) return '';
    if (typeof condition === 'string') return condition.trim();
    if (Array.isArray(condition)) return condition.join(' ');
    if (!isObject(condition)) return '';

    return Object.keys(condition)
        .map((fieldName) => conditionItemProcessor(fieldName, condition[fieldName]))
        .filter(Boolean)
        .join(' ');
}

function conditionItemProcessor(fieldName: string, fieldInfo: any): string {
    const key = normalizeKey(fieldName);

    if (key.startsWith('EXPRESSION')) return String(fieldInfo);
    if (key.startsWith('SUBQUERY')) return `(${renderQueryInput(fieldInfo)})`;
    if (key.startsWith('NOTEXISTS')) return existsProcessor(fieldInfo, 'NOT EXISTS');
    if (key.startsWith('EXISTS')) return existsProcessor(fieldInfo, 'EXISTS');

    if (!isObject(fieldInfo)) return `${fieldName} ${fieldInfo}`.trim();

    if (fieldInfo.raw) return appendGate(String(fieldInfo.raw), fieldInfo.gate);

    const field = util_IdentifyObjectRelName(fieldInfo) || fieldName;
    const operator = fieldInfo.operator || fieldInfo.op;
    const valueExists = Object.prototype.hasOwnProperty.call(fieldInfo, 'value');
    const condition = operator ? buildPredicate(field, operator, valueExists ? fieldInfo.value : undefined) : field;
    return appendGate(condition, fieldInfo.gate);
}

function existsProcessor(fieldInfo: any, existClause: 'EXISTS' | 'NOT EXISTS'): string {
    const query = isObject(fieldInfo) && Object.prototype.hasOwnProperty.call(fieldInfo, 'query') ? fieldInfo.query : fieldInfo;
    const rendered = typeof query === 'string' ? query.trim() : `(${renderQueryInput(query)})`;
    return appendGate(`${existClause} ${rendered}`, isObject(fieldInfo) ? fieldInfo.gate : '');
}

function buildPredicate(field: string, operator: string, value: any): string {
    if (value === undefined) return `${field} ${operator}`;

    const normalizedOperator = String(operator).trim().toUpperCase();
    if (normalizedOperator === 'IN' || normalizedOperator === 'NOT IN') {
        return `${field} ${operator} ${renderListOrSubquery(value)}`;
    }

    if (normalizedOperator === 'BETWEEN' && Array.isArray(value) && value.length >= 2) {
        return `${field} BETWEEN ${renderConditionValue(value[0])} AND ${renderConditionValue(value[1])}`;
    }

    return `${field} ${operator} ${renderConditionValue(value)}`;
}

function clauseListProcessor(input?: ClauseListInput): string {
    if (!input) return '';
    if (typeof input === 'string') return input.trim();
    if (Array.isArray(input)) return input.map(renderClauseListItem).filter(Boolean).join(', ');
    if (!isObject(input)) return '';

    const clauses: string[] = [];

    if (input.expression) clauses.push(String(input.expression));
    if (input.rollup) clauses.push(`ROLLUP (${renderClauseList(input.rollup)})`);
    if (input.cube) clauses.push(`CUBE (${renderClauseList(input.cube)})`);
    if (input.groupingSets) clauses.push(`GROUPING SETS (${renderGroupingSets(input.groupingSets)})`);

    for (const key in input) {
        if (['expression', 'rollup', 'cube', 'groupingSets'].includes(key)) continue;
        const value = input[key];
        if (isObject(value)) clauses.push(renderOrderByItem(key, value));
        else if (value) clauses.push(`${key} ${value}`.trim());
        else clauses.push(key);
    }

    return clauses.filter(Boolean).join(', ');
}

function renderClauseListItem(item: string | QueryObject): string {
    if (typeof item === 'string') return item;
    if (!isObject(item)) return '';
    if (item.expression) return String(item.expression);
    if (item.field) return renderOrderByItem(String(item.field), item);
    return '';
}

function renderClauseList(input: any): string {
    if (Array.isArray(input)) return input.map((item) => String(item)).join(', ');
    return String(input);
}

function renderGroupingSets(input: any): string {
    if (!Array.isArray(input)) return String(input);
    return input
        .map((set) => (Array.isArray(set) ? `(${set.join(', ')})` : `(${String(set)})`))
        .join(', ');
}

function renderOrderByItem(field: string, value: QueryObject): string {
    const expression = value.expression || value.field || field;
    return [expression, value.direction, value.nulls].filter(Boolean).join(' ');
}

function windowProcessor(window?: QueryObject | string[]): string {
    if (!window) return '';
    if (Array.isArray(window)) return window.join(', ');
    if (!isObject(window)) return '';

    return Object.keys(window)
        .map((name) => `${name} AS (${windowSpecProcessor(window[name])})`)
        .join(', ');
}

function windowSpecProcessor(spec: any): string {
    if (typeof spec === 'string') return spec.trim();
    if (!isObject(spec)) return '';

    const parts: string[] = [];
    const partitionBy = spec.partitionBy || spec.partition;
    const orderBy = spec.orderBy || spec.order;

    if (partitionBy) parts.push('PARTITION BY', renderClauseList(partitionBy));
    if (orderBy) parts.push('ORDER BY', renderClauseList(orderBy));
    if (spec.frame) parts.push(spec.frame);

    return parts.join(' ');
}

function overProcessor(spec: any): string {
    if (typeof spec === 'string') {
        const trimmed = spec.trim();
        if (!trimmed) return 'OVER ()';
        if (trimmed.toUpperCase().startsWith('OVER ')) return trimmed;
        if (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(trimmed)) return `OVER ${trimmed}`;
        return `OVER (${trimmed})`;
    }

    return `OVER (${windowSpecProcessor(spec)})`;
}

function withProcessor(withInput?: CteInput): string {
    if (!withInput) return '';

    const ctes = Array.isArray(withInput)
        ? withInput.map((cte) => cteProcessor(cte.name, cte.query, cte.columns))
        : Object.keys(withInput).map((name) => {
              const cteInfo = withInput[name];
              if (isObject(cteInfo) && Object.prototype.hasOwnProperty.call(cteInfo, 'query')) {
                  return cteProcessor(name, cteInfo.query, cteInfo.columns);
              }
              return cteProcessor(name, cteInfo);
          });

    return ctes.length ? `WITH ${ctes.filter(Boolean).join(', ')}` : '';
}

function cteProcessor(name: string, query: JsonToSuiteQLQuery | string, columns?: string[]): string {
    const columnList = Array.isArray(columns) && columns.length ? ` (${columns.join(', ')})` : '';
    return `${name}${columnList} AS (${renderQueryInput(query)})`;
}

function finalClauseProcessor(jsonQuery: JsonToSuiteQLQuery): string {
    const clauses: string[] = [];
    const orderBy = clauseListProcessor(jsonQuery.orderBy);

    if (orderBy) clauses.push('ORDER BY', orderBy);

    if (jsonQuery.offset !== undefined) {
        clauses.push('OFFSET', String(jsonQuery.offset), 'ROWS');
    }

    const fetch = fetchProcessor(jsonQuery.fetch ?? jsonQuery.limit, jsonQuery.offset !== undefined);
    if (fetch) clauses.push(fetch);

    return clauses.join(' ');
}

function fetchProcessor(fetch: JsonToSuiteQLQuery['fetch'] | JsonToSuiteQLQuery['limit'], hasOffset: boolean): string {
    if (fetch === undefined) return '';

    const fetchWord = hasOffset ? 'NEXT' : 'FIRST';

    if (isObject(fetch)) {
        const rows = fetch.rows ?? 1;
        const percent = fetch.percent ? ' PERCENT' : '';
        const suffix = fetch.withTies ? 'WITH TIES' : 'ONLY';
        return `FETCH ${fetchWord} ${rows}${percent} ROWS ${suffix}`;
    }

    return `FETCH ${fetchWord} ${fetch} ROWS ONLY`;
}

function setOperatorProcessor(baseQuery: string, jsonQuery: JsonToSuiteQLQuery): string {
    const clauses: Array<[SetOperator, Array<JsonToSuiteQLQuery | string> | undefined]> = [
        ['UNION', jsonQuery.union],
        ['UNION ALL', jsonQuery.unionAll],
        ['INTERSECT', jsonQuery.intersect],
        ['INTERSECT ALL', jsonQuery.intersectAll],
        ['MINUS', jsonQuery.minus],
        ['MINUS ALL', jsonQuery.minusAll],
        ['EXCEPT', jsonQuery.except],
        ['EXCEPT ALL', jsonQuery.exceptAll]
    ];

    const renderedClauses: string[] = [];

    for (const [operator, values] of clauses) {
        if (!Array.isArray(values) || !values.length) continue;
        const renderedValues = values.map(renderQueryInput).filter(Boolean);
        if (!renderedClauses.length && !baseQuery) {
            renderedClauses.push(renderedValues.shift() || '');
        }
        renderedClauses.push(...renderedValues.map((value) => `${operator} ${value}`));
    }

    return [baseQuery, ...renderedClauses].filter(Boolean).join(' ');
}

function hasAnySetOperator(jsonQuery: JsonToSuiteQLQuery): boolean {
    return ['union', 'unionAll', 'intersect', 'intersectAll', 'minus', 'minusAll', 'except', 'exceptAll'].some(
        (key) => Array.isArray(jsonQuery[key]) && jsonQuery[key].length
    );
}

function renderListOrSubquery(value: any): string {
    if (Array.isArray(value)) return `(${value.map(renderConditionValue).join(', ')})`;
    if (isObject(value)) {
        if (typeof value.param === 'string') return `(${namedParam(value.param)})`;
        const rawValue = util_IdentifyObjectRelName(value);
        if (rawValue && !isQueryLikeObject(value)) return rawValue;
        return `(${jsonToSuiteQL(value)})`;
    }
    return String(value);
}

function renderConditionValue(value: any): string {
    if (Array.isArray(value)) return `(${value.map(renderConditionValue).join(', ')})`;
    if (isObject(value)) {
        if (typeof value.param === 'string') return namedParam(value.param);
        const rawValue = util_IdentifyObjectRelName(value);
        if (rawValue && !isQueryLikeObject(value)) return rawValue;
        return `(${jsonToSuiteQL(value)})`;
    }
    return String(value);
}

function renderUsingClause(value: any): string {
    if (Array.isArray(value)) return `(${value.join(', ')})`;
    const rendered = String(value).trim();
    return rendered.startsWith('(') ? rendered : `(${rendered})`;
}

function renderExpressionWithAlias(expression: string, alias?: string): string {
    return alias ? `${expression} as ${alias}` : expression;
}

function renderQueryInput(query: JsonToSuiteQLQuery | string): string {
    return typeof query === 'string' ? query.trim() : jsonToSuiteQL(query);
}

function appendGate(condition: string, gate?: string): string {
    return gate ? `${condition} ${gate}` : condition;
}

function convertNamedParamsToPositional(query: string, params: SuiteQLNamedParams): SuiteQLPreparedQuery {
    const output: string[] = [];
    const positionalParams: SuiteQLParamValue[] = [];
    const paramNames: string[] = [];
    let index = 0;

    while (index < query.length) {
        const char = query[index];
        const next = query[index + 1];

        if (char === "'") {
            index = copyQuotedSection(query, index, output, "'");
            continue;
        }

        if (char === '"') {
            index = copyQuotedSection(query, index, output, '"');
            continue;
        }

        if (char === '-' && next === '-') {
            index = copyLineComment(query, index, output);
            continue;
        }

        if (char === '/' && next === '*') {
            index = copyBlockComment(query, index, output);
            continue;
        }

        const namedParameter = readNamedParameter(query, index);
        if (namedParameter) {
            if (!Object.prototype.hasOwnProperty.call(params, namedParameter.name)) {
                throw new Error(`Missing value for named parameter :${namedParameter.name}.`);
            }

            const value = params[namedParameter.name];
            if (Array.isArray(value)) {
                if (!value.length) {
                    throw new Error(`Array parameter :${namedParameter.name} cannot be empty.`);
                }

                output.push(new Array(value.length).fill('?').join(','));
                positionalParams.push(...value);
                paramNames.push(...value.map(() => namedParameter.name));
            } else {
                output.push('?');
                positionalParams.push(value);
                paramNames.push(namedParameter.name);
            }
            index = namedParameter.end;
            continue;
        }

        output.push(char);
        index++;
    }

    return {
        query: output.join(''),
        params: positionalParams,
        paramNames
    };
}

function copyQuotedSection(query: string, start: number, output: string[], quote: "'" | '"'): number {
    let index = start;
    output.push(query[index]);
    index++;

    while (index < query.length) {
        output.push(query[index]);

        if (query[index] === quote) {
            if (query[index + 1] === quote) {
                output.push(query[index + 1]);
                index += 2;
                continue;
            }

            index++;
            break;
        }

        index++;
    }

    return index;
}

function copyLineComment(query: string, start: number, output: string[]): number {
    let index = start;

    while (index < query.length) {
        output.push(query[index]);
        if (query[index] === '\n') {
            index++;
            break;
        }
        index++;
    }

    return index;
}

function copyBlockComment(query: string, start: number, output: string[]): number {
    let index = start;

    while (index < query.length) {
        output.push(query[index]);

        if (query[index] === '*' && query[index + 1] === '/') {
            output.push(query[index + 1]);
            index += 2;
            break;
        }

        index++;
    }

    return index;
}

function readNamedParameter(query: string, start: number): {name: string; end: number} | null {
    const marker = query[start];
    if (marker !== ':' && marker !== '@') return null;
    if (marker === ':' && query[start + 1] === ':') return null;

    const previous = query[start - 1];
    if (previous && isIdentifierPart(previous)) return null;

    const firstNameChar = query[start + 1];
    if (!isIdentifierStart(firstNameChar)) return null;

    let end = start + 2;
    while (end < query.length && isIdentifierPart(query[end])) {
        end++;
    }

    return {
        name: query.slice(start + 1, end),
        end
    };
}

function assertReadOnlyQuery(jsonQuery: JsonToSuiteQLQuery): void {
    for (const key of Object.keys(jsonQuery)) {
        if (READ_ONLY_BLOCKED_KEYS.has(normalizeKey(key))) {
            throw new Error(`SuiteQL is read-only. Unsupported clause "${key}" was provided.`);
        }
    }
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
    return value.replace(/[\s_-]/g, '').toUpperCase();
}

function isObject(value: any): value is QueryObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidParamName(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function isIdentifierStart(char: string | undefined): boolean {
    return !!char && /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
    return !!char && /[A-Za-z0-9_]/.test(char);
}

function isQueryLikeObject(value: QueryObject): boolean {
    return [
        'select',
        'from',
        'where',
        'groupBy',
        'having',
        'orderBy',
        'union',
        'unionAll',
        'intersect',
        'minus',
        'except'
    ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/**
 * Identify relative name.
 * Priority: name, table, field, expression.
 */
function util_IdentifyObjectRelName(obj: any): string {
    if (!isObject(obj)) return '';
    return obj.name || obj.table || obj.field || obj.expression || '';
}
