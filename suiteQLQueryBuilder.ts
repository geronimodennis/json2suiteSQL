export type SuiteQLGate = 'AND' | 'OR';
export type SuiteQLDialect = 'suiteql' | 'oracle' | 'ansi';
export type SuiteQLJoinType =
    | 'JOIN'
    | 'LEFT JOIN'
    | 'LEFT OUTER JOIN'
    | 'RIGHT JOIN'
    | 'RIGHT OUTER JOIN'
    | 'INNER JOIN'
    | 'OUTER JOIN'
    | 'FULL JOIN'
    | 'FULL OUTER JOIN'
    | 'CROSS JOIN';
export type SuiteQLSetOperator = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'INTERSECT ALL' | 'MINUS' | 'MINUS ALL' | 'EXCEPT' | 'EXCEPT ALL';
export type SuiteQLValue = string | number | boolean | bigint | null | Date | SuiteQLRaw | SuiteQLValue[];
export type SuiteQLQueryInput = SuiteQLQueryBuilder | JsonLikeQueryObject | string;
export type SuiteQLOrderDirection = 'ASC' | 'DESC';
export type SuiteQLNullsOrder = 'NULLS FIRST' | 'NULLS LAST';

export interface SuiteQLBuilderOptions {
    dialect?: SuiteQLDialect;
}

export interface SuiteQLRaw {
    readonly __suiteQLRaw: true;
    readonly value: string;
}

export interface SuiteQLWindowSpec {
    partitionBy?: string | string[];
    orderBy?: string | string[];
    frame?: string;
}

export interface SuiteQLFetchOptions {
    percent?: boolean;
    withTies?: boolean;
}

export interface JsonLikeQueryObject {
    with?: unknown;
    distinct?: boolean;
    all?: boolean;
    select?: QueryObject;
    from?: QueryObject;
    where?: QueryObject | string;
    groupBy?: string[];
    having?: QueryObject | string;
    window?: QueryObject | string[];
    qualify?: QueryObject | string;
    orderBy?: string[];
    offset?: number | string;
    fetch?: number | string | {rows: number | string; percent?: boolean; withTies?: boolean};
    limit?: number | string;
    forUpdate?: boolean | string;
    startWith?: string;
    connectBy?: string;
    union?: Array<JsonLikeQueryObject | string>;
    unionAll?: Array<JsonLikeQueryObject | string>;
    intersect?: Array<JsonLikeQueryObject | string>;
    intersectAll?: Array<JsonLikeQueryObject | string>;
    minus?: Array<JsonLikeQueryObject | string>;
    minusAll?: Array<JsonLikeQueryObject | string>;
    except?: Array<JsonLikeQueryObject | string>;
    exceptAll?: Array<JsonLikeQueryObject | string>;
    as?: string;
    on?: string;
    gate?: string;
    [key: string]: unknown;
}

type QueryObject = Record<string, unknown>;

interface SelectClause {
    expression: string;
    alias?: string;
}

interface SourceClause {
    expression: string;
    alias?: string;
}

interface JoinClause {
    type?: SuiteQLJoinType;
    expression: string;
    alias?: string;
    on?: string;
    raw?: boolean;
}

interface WhereClause {
    expression: string;
    gate: SuiteQLGate;
}

interface CteClause {
    name: string;
    query: SuiteQLQueryInput;
    columns?: string[];
    recursive?: boolean;
}

interface WindowClause {
    name: string;
    spec: string | SuiteQLWindowSpec;
}

interface FetchClause {
    rows: string;
    percent?: boolean;
    withTies?: boolean;
}

interface SetClause {
    type: SuiteQLSetOperator;
    query: SuiteQLQueryInput;
}

export function raw(value: string): SuiteQLRaw {
    return Object.freeze({__suiteQLRaw: true, value});
}

export function param(): SuiteQLRaw {
    return raw('?');
}

export function suiteQL(): SuiteQLQueryBuilder {
    return new SuiteQLQueryBuilder();
}

export function sql(options: SuiteQLBuilderOptions = {}): SuiteQLQueryBuilder {
    return new SuiteQLQueryBuilder(options);
}

export function oracleSQL(): SuiteQLQueryBuilder {
    return new SuiteQLQueryBuilder({dialect: 'oracle'});
}

export function suiteQLFromObject(query: JsonLikeQueryObject): SuiteQLQueryBuilder {
    return SuiteQLQueryBuilder.fromObject(query);
}

export function oracleSQLFromObject(query: JsonLikeQueryObject): SuiteQLQueryBuilder {
    return SuiteQLQueryBuilder.fromObject(query, {dialect: 'oracle'});
}

export function over(spec: string | SuiteQLWindowSpec = ''): string {
    return renderOverClause(spec);
}

export class SuiteQLQueryBuilder {
    private readonly dialect: SuiteQLDialect;
    private selectModifier: 'DISTINCT' | 'ALL' | '' = '';
    private readonly cteClauses: CteClause[] = [];
    private readonly selectClauses: SelectClause[] = [];
    private readonly sourceClauses: SourceClause[] = [];
    private readonly joinClauses: JoinClause[] = [];
    private readonly whereClauses: WhereClause[] = [];
    private readonly startWithClauses: WhereClause[] = [];
    private readonly connectByClauses: WhereClause[] = [];
    private readonly groupByClauses: string[] = [];
    private readonly havingClauses: WhereClause[] = [];
    private readonly windowClauses: WindowClause[] = [];
    private readonly qualifyClauses: WhereClause[] = [];
    private readonly orderByClauses: string[] = [];
    private readonly setClauses: SetClause[] = [];
    private offsetClause = '';
    private fetchClause?: FetchClause;
    private forUpdateClause = '';

    constructor(options: SuiteQLBuilderOptions = {}) {
        this.dialect = options.dialect || 'suiteql';
    }

    static fromObject(query: JsonLikeQueryObject, options: SuiteQLBuilderOptions = {}): SuiteQLQueryBuilder {
        const builder = new SuiteQLQueryBuilder(options);

        if (!isObject(query)) return builder;

        if (query.with) {
            builder.applyCteObject(query.with);
        }

        if (query.distinct) {
            builder.distinct();
        } else if (query.all) {
            builder.selectAll();
        }

        if (query.select) {
            builder.applySelectObject(query.select);
        }

        if (query.from) {
            builder.applyFromObject(query.from);
        }

        if (query.where) {
            builder.applyWhereObject(query.where);
        }

        if (Array.isArray(query.groupBy)) {
            builder.groupBy(...query.groupBy);
        }

        if (query.having) {
            builder.applyHavingObject(query.having);
        }

        if (query.window) {
            builder.applyWindowObject(query.window);
        }

        if (query.qualify) {
            builder.applyQualifyObject(query.qualify);
        }

        if (Array.isArray(query.orderBy)) {
            builder.orderBy(...query.orderBy);
        }

        if (query.offset !== undefined) {
            builder.offset(query.offset);
        }

        if (query.fetch !== undefined) {
            if (isObject(query.fetch) && query.fetch.rows !== undefined) {
                builder.fetchFirst(query.fetch.rows, {percent: query.fetch.percent, withTies: query.fetch.withTies});
            } else {
                builder.fetchFirst(query.fetch as number | string);
            }
        } else if (query.limit !== undefined) {
            builder.limit(query.limit);
        }

        if (query.forUpdate !== undefined) {
            builder.forUpdate(query.forUpdate === true ? undefined : String(query.forUpdate));
        }

        if (query.startWith) {
            builder.startWith(query.startWith);
        }

        if (query.connectBy) {
            builder.connectBy(query.connectBy);
        }

        if (Array.isArray(query.union)) {
            builder.union(...query.union);
        }

        if (Array.isArray(query.unionAll)) {
            builder.unionAll(...query.unionAll);
        }

        if (Array.isArray(query.intersect)) {
            builder.intersect(...query.intersect);
        }

        if (Array.isArray(query.intersectAll)) {
            builder.intersectAll(...query.intersectAll);
        }

        if (Array.isArray(query.minus)) {
            builder.minus(...query.minus);
        }

        if (Array.isArray(query.minusAll)) {
            builder.minusAll(...query.minusAll);
        }

        if (Array.isArray(query.except)) {
            builder.except(...query.except);
        }

        if (Array.isArray(query.exceptAll)) {
            builder.exceptAll(...query.exceptAll);
        }

        return builder;
    }

    with(name: string, query: SuiteQLQueryInput, columns?: string[]): this {
        return this.withCte(name, query, columns);
    }

    withCte(name: string, query: SuiteQLQueryInput, columns?: string[]): this {
        this.cteClauses.push({name, query, columns});
        return this;
    }

    withRecursive(name: string, query: SuiteQLQueryInput, columns?: string[]): this {
        this.cteClauses.push({name, query, columns, recursive: true});
        return this;
    }

    distinct(): this {
        this.selectModifier = 'DISTINCT';
        return this;
    }

    selectDistinct(): this {
        return this.distinct();
    }

    selectAll(): this {
        this.selectModifier = 'ALL';
        return this;
    }

    select(field: string, alias?: string): this;
    select(fields: string[]): this;
    select(fields: QueryObject): this;
    select(fieldOrFields: string | string[] | QueryObject, alias?: string): this {
        if (typeof fieldOrFields === 'string') {
            this.selectClauses.push({expression: fieldOrFields, alias});
            return this;
        }

        if (Array.isArray(fieldOrFields)) {
            fieldOrFields.forEach((field) => this.select(field));
            return this;
        }

        this.applyBuilderSelectObject(fieldOrFields);
        return this;
    }

    selectAs(expression: string, alias: string): this {
        return this.select(expression, alias);
    }

    selectRaw(expression: string, alias?: string): this {
        this.selectClauses.push({expression, alias});
        return this;
    }

    selectSubquery(query: SuiteQLQueryInput, alias: string): this {
        this.selectClauses.push({expression: `(${renderQueryInput(query, {dialect: this.dialect})})`, alias});
        return this;
    }

    selectWindow(expression: string, spec: string | SuiteQLWindowSpec = '', alias?: string): this {
        this.selectClauses.push({expression: `${expression} ${renderOverClause(spec)}`, alias});
        return this;
    }

    rowNumber(alias: string, spec: string | SuiteQLWindowSpec = ''): this {
        return this.selectWindow('ROW_NUMBER()', spec, alias);
    }

    rank(alias: string, spec: string | SuiteQLWindowSpec = ''): this {
        return this.selectWindow('RANK()', spec, alias);
    }

    denseRank(alias: string, spec: string | SuiteQLWindowSpec = ''): this {
        return this.selectWindow('DENSE_RANK()', spec, alias);
    }

    from(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, alias?: string): this {
        if (typeof source === 'string') {
            this.sourceClauses.push({expression: source, alias});
            return this;
        }

        this.sourceClauses.push({expression: `(${renderQueryInput(source, {dialect: this.dialect})})`, alias});
        return this;
    }

    fromRaw(expression: string): this {
        this.sourceClauses.push({expression});
        return this;
    }

    fromSubquery(query: SuiteQLQueryInput, alias: string): this {
        this.sourceClauses.push({expression: `(${renderQueryInput(query, {dialect: this.dialect})})`, alias});
        return this;
    }

    join(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('JOIN', source, aliasOrOn, on);
    }

    leftJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('LEFT JOIN', source, aliasOrOn, on);
    }

    rightJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('RIGHT JOIN', source, aliasOrOn, on);
    }

    innerJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('INNER JOIN', source, aliasOrOn, on);
    }

    outerJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('OUTER JOIN', source, aliasOrOn, on);
    }

    fullJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('FULL JOIN', source, aliasOrOn, on);
    }

    fullOuterJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('FULL OUTER JOIN', source, aliasOrOn, on);
    }

    crossJoin(source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin('CROSS JOIN', source, aliasOrOn, on);
    }

    joinAs(type: SuiteQLJoinType, source: string | SuiteQLQueryBuilder | JsonLikeQueryObject, aliasOrOn?: string, on?: string): this {
        return this.addJoin(type, source, aliasOrOn, on);
    }

    joinRaw(expression: string): this {
        this.joinClauses.push({expression, raw: true});
        return this;
    }

    where(field: string, operator: string, value?: SuiteQLValue): this {
        return this.addWhere('AND', buildPredicate(field, operator, value));
    }

    andWhere(field: string, operator: string, value?: SuiteQLValue): this {
        return this.where(field, operator, value);
    }

    orWhere(field: string, operator: string, value?: SuiteQLValue): this {
        return this.addWhere('OR', buildPredicate(field, operator, value));
    }

    whereRaw(expression: string): this {
        return this.addWhere('AND', expression);
    }

    andWhereRaw(expression: string): this {
        return this.whereRaw(expression);
    }

    orWhereRaw(expression: string): this {
        return this.addWhere('OR', expression);
    }

    whereIn(field: string, values: SuiteQLValue[] | SuiteQLQueryInput): this {
        return this.addWhere('AND', `${field} IN ${renderListOrSubquery(values, this.dialect)}`);
    }

    orWhereIn(field: string, values: SuiteQLValue[] | SuiteQLQueryInput): this {
        return this.addWhere('OR', `${field} IN ${renderListOrSubquery(values, this.dialect)}`);
    }

    whereNotIn(field: string, values: SuiteQLValue[] | SuiteQLQueryInput): this {
        return this.addWhere('AND', `${field} NOT IN ${renderListOrSubquery(values, this.dialect)}`);
    }

    whereBetween(field: string, start: SuiteQLValue, end: SuiteQLValue): this {
        return this.addWhere('AND', `${field} BETWEEN ${formatValue(start)} AND ${formatValue(end)}`);
    }

    whereNull(field: string): this {
        return this.addWhere('AND', `${field} IS NULL`);
    }

    whereNotNull(field: string): this {
        return this.addWhere('AND', `${field} IS NOT NULL`);
    }

    exists(query: SuiteQLQueryInput): this {
        return this.addWhere('AND', `EXISTS (${renderQueryInput(query, {dialect: this.dialect})})`);
    }

    orExists(query: SuiteQLQueryInput): this {
        return this.addWhere('OR', `EXISTS (${renderQueryInput(query, {dialect: this.dialect})})`);
    }

    notExists(query: SuiteQLQueryInput): this {
        return this.addWhere('AND', `NOT EXISTS (${renderQueryInput(query, {dialect: this.dialect})})`);
    }

    orNotExists(query: SuiteQLQueryInput): this {
        return this.addWhere('OR', `NOT EXISTS (${renderQueryInput(query, {dialect: this.dialect})})`);
    }

    groupBy(...fields: Array<string | string[]>): this {
        this.groupByClauses.push(...flattenStrings(fields));
        return this;
    }

    rollup(...fields: Array<string | string[]>): this {
        this.groupByClauses.push(`ROLLUP (${flattenStrings(fields).join(', ')})`);
        return this;
    }

    cube(...fields: Array<string | string[]>): this {
        this.groupByClauses.push(`CUBE (${flattenStrings(fields).join(', ')})`);
        return this;
    }

    groupingSets(...sets: Array<string | string[]>): this {
        const renderedSets = sets.map((set) => (Array.isArray(set) ? `(${set.join(', ')})` : `(${set})`));
        this.groupByClauses.push(`GROUPING SETS (${renderedSets.join(', ')})`);
        return this;
    }

    having(field: string, operator: string, value?: SuiteQLValue): this {
        return this.addHaving('AND', buildPredicate(field, operator, value));
    }

    andHaving(field: string, operator: string, value?: SuiteQLValue): this {
        return this.having(field, operator, value);
    }

    orHaving(field: string, operator: string, value?: SuiteQLValue): this {
        return this.addHaving('OR', buildPredicate(field, operator, value));
    }

    havingRaw(expression: string): this {
        return this.addHaving('AND', expression);
    }

    orHavingRaw(expression: string): this {
        return this.addHaving('OR', expression);
    }

    window(name: string, spec: string | SuiteQLWindowSpec): this {
        this.windowClauses.push({name, spec});
        return this;
    }

    qualify(field: string, operator: string, value?: SuiteQLValue): this {
        return this.addQualify('AND', buildPredicate(field, operator, value));
    }

    qualifyRaw(expression: string): this {
        return this.addQualify('AND', expression);
    }

    orQualifyRaw(expression: string): this {
        return this.addQualify('OR', expression);
    }

    orderBy(...fields: Array<string | string[]>): this {
        this.orderByClauses.push(...flattenStrings(fields));
        return this;
    }

    orderByColumn(field: string, direction: SuiteQLOrderDirection = 'ASC', nulls?: SuiteQLNullsOrder): this {
        this.orderByClauses.push([field, direction, nulls].filter(Boolean).join(' '));
        return this;
    }

    offset(rows: number | string): this {
        this.offsetClause = String(rows);
        return this;
    }

    fetchFirst(rows: number | string, options: SuiteQLFetchOptions = {}): this {
        this.fetchClause = {rows: String(rows), percent: options.percent, withTies: options.withTies};
        return this;
    }

    limit(rows: number | string): this {
        return this.fetchFirst(rows);
    }

    forUpdate(options = ''): this {
        this.forUpdateClause = options;
        return this;
    }

    startWith(expression: string): this {
        this.startWithClauses.push({gate: 'AND', expression});
        return this;
    }

    connectBy(expression: string, nocycle = false): this {
        this.connectByClauses.push({gate: 'AND', expression: nocycle ? `NOCYCLE ${expression}` : expression});
        return this;
    }

    union(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('UNION', ...queries);
    }

    unionAll(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('UNION ALL', ...queries);
    }

    intersect(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('INTERSECT', ...queries);
    }

    intersectAll(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('INTERSECT ALL', ...queries);
    }

    minus(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('MINUS', ...queries);
    }

    minusAll(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('MINUS ALL', ...queries);
    }

    except(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('EXCEPT', ...queries);
    }

    exceptAll(...queries: SuiteQLQueryInput[]): this {
        return this.setOperator('EXCEPT ALL', ...queries);
    }

    setOperator(type: SuiteQLSetOperator, ...queries: SuiteQLQueryInput[]): this {
        queries.forEach((query) => this.setClauses.push({type, query}));
        return this;
    }

    toSQL(): string {
        return this.toSuiteQL();
    }

    toOracleSQL(): string {
        return this.toSuiteQL();
    }

    clone(): SuiteQLQueryBuilder {
        const builder = new SuiteQLQueryBuilder({dialect: this.dialect});
        builder.selectModifier = this.selectModifier;
        builder.cteClauses.push(...this.cteClauses.map((clause) => ({...clause, columns: clause.columns ? [...clause.columns] : undefined})));
        builder.selectClauses.push(...this.selectClauses.map((clause) => ({...clause})));
        builder.sourceClauses.push(...this.sourceClauses.map((clause) => ({...clause})));
        builder.joinClauses.push(...this.joinClauses.map((clause) => ({...clause})));
        builder.whereClauses.push(...this.whereClauses.map((clause) => ({...clause})));
        builder.startWithClauses.push(...this.startWithClauses.map((clause) => ({...clause})));
        builder.connectByClauses.push(...this.connectByClauses.map((clause) => ({...clause})));
        builder.groupByClauses.push(...this.groupByClauses);
        builder.havingClauses.push(...this.havingClauses.map((clause) => ({...clause})));
        builder.windowClauses.push(...this.windowClauses.map((clause) => ({...clause})));
        builder.qualifyClauses.push(...this.qualifyClauses.map((clause) => ({...clause})));
        builder.orderByClauses.push(...this.orderByClauses);
        builder.setClauses.push(...this.setClauses.map((clause) => ({...clause})));
        builder.offsetClause = this.offsetClause;
        builder.fetchClause = this.fetchClause ? {...this.fetchClause} : undefined;
        builder.forUpdateClause = this.forUpdateClause;
        return builder;
    }

    toSuiteQL(): string {
        const hasSetClauses = this.setClauses.length > 0;
        const baseQuery = this.renderQueryBlock(!hasSetClauses);
        const setQuery = this.renderSetQuery(baseQuery);
        const finalQuery = hasSetClauses ? [setQuery || baseQuery, this.renderFinalClauses()].filter(Boolean).join(' ') : setQuery || baseQuery;
        return normalizeWhitespace([this.renderWithClause(), finalQuery].filter(Boolean).join(' '));
    }

    toString(): string {
        return this.toSuiteQL();
    }

    private addJoin(
        type: SuiteQLJoinType,
        source: string | SuiteQLQueryBuilder | JsonLikeQueryObject,
        aliasOrOn?: string,
        on?: string
    ): this {
        const expression = typeof source === 'string' ? source : `(${renderQueryInput(source, {dialect: this.dialect})})`;
        const alias = on ? aliasOrOn : undefined;
        const joinOn = on || aliasOrOn;
        this.joinClauses.push({type, expression, alias, on: joinOn});
        return this;
    }

    private addWhere(gate: SuiteQLGate, expression: string): this {
        this.whereClauses.push({gate, expression});
        return this;
    }

    private addHaving(gate: SuiteQLGate, expression: string): this {
        this.havingClauses.push({gate, expression});
        return this;
    }

    private addQualify(gate: SuiteQLGate, expression: string): this {
        this.qualifyClauses.push({gate, expression});
        return this;
    }

    private renderWithClause(): string {
        if (!this.cteClauses.length) return '';

        const hasRecursive = this.cteClauses.some((clause) => clause.recursive);
        const withKeyword = hasRecursive && this.dialect === 'ansi' ? 'WITH RECURSIVE' : 'WITH';
        return `${withKeyword} ${this.cteClauses.map((clause) => renderCteClause(clause, this.dialect)).join(', ')}`;
    }

    private renderQueryBlock(includeFinalClauses: boolean): string {
        const parts: string[] = [];

        if (this.selectClauses.length) {
            parts.push('SELECT');
            if (this.selectModifier) parts.push(this.selectModifier);
            parts.push(this.selectClauses.map(renderSelectClause).join(', '));
        }

        if (this.sourceClauses.length || this.joinClauses.length) {
            const fromParts = this.sourceClauses.map((clause) => renderSourceClause(clause, this.dialect));
            const joinParts = this.joinClauses.map((clause) => renderJoinClause(clause, this.dialect));
            parts.push('FROM', [...fromParts, ...joinParts].join(' '));
        }

        if (this.whereClauses.length) {
            parts.push('WHERE', this.whereClauses.map(renderWhereClause).join(' '));
        }

        if (this.startWithClauses.length) {
            parts.push('START WITH', this.startWithClauses.map(renderWhereClause).join(' '));
        }

        if (this.connectByClauses.length) {
            parts.push('CONNECT BY', this.connectByClauses.map(renderWhereClause).join(' '));
        }

        if (this.groupByClauses.length) {
            parts.push('GROUP BY', this.groupByClauses.join(', '));
        }

        if (this.havingClauses.length) {
            parts.push('HAVING', this.havingClauses.map(renderWhereClause).join(' '));
        }

        if (this.windowClauses.length) {
            parts.push('WINDOW', this.windowClauses.map(renderWindowClause).join(', '));
        }

        if (this.qualifyClauses.length) {
            parts.push('QUALIFY', this.qualifyClauses.map(renderWhereClause).join(' '));
        }

        if (includeFinalClauses) {
            const finalClauses = this.renderFinalClauses();
            if (finalClauses) parts.push(finalClauses);
        }

        return parts.join(' ');
    }

    private renderFinalClauses(): string {
        const parts: string[] = [];

        if (this.orderByClauses.length) {
            parts.push('ORDER BY', this.orderByClauses.join(', '));
        }

        if (this.offsetClause) {
            parts.push('OFFSET', this.offsetClause, 'ROWS');
        }

        if (this.fetchClause) {
            const fetchWord = this.offsetClause ? 'NEXT' : 'FIRST';
            const percent = this.fetchClause.percent ? ' PERCENT' : '';
            const suffix = this.fetchClause.withTies ? 'WITH TIES' : 'ONLY';
            parts.push('FETCH', fetchWord, `${this.fetchClause.rows}${percent}`, 'ROWS', suffix);
        }

        if (this.forUpdateClause !== '') {
            parts.push(['FOR UPDATE', this.forUpdateClause].filter(Boolean).join(' '));
        }

        return parts.join(' ');
    }

    private renderSetQuery(baseQuery: string): string {
        if (!this.setClauses.length) return '';

        if (!baseQuery) {
            const [firstClause, ...remainingClauses] = this.setClauses;
            if (!firstClause) return '';

            const firstQuery = renderQueryInput(firstClause.query, {dialect: this.dialect});
            const rest = remainingClauses.map((clause) => `${clause.type} ${renderQueryInput(clause.query, {dialect: this.dialect})}`);
            return [firstQuery, ...rest].join(' ');
        }

        const rest = this.setClauses.map((clause) => `${clause.type} ${renderQueryInput(clause.query, {dialect: this.dialect})}`);
        return [baseQuery, ...rest].join(' ');
    }

    private applyCteObject(ctes: unknown): void {
        if (Array.isArray(ctes)) {
            ctes.forEach((cte) => {
                if (!isObject(cte)) return;
                const name = readString(cte, 'name');
                const query = cte.query;
                if (name && query !== undefined) {
                    this.cteClauses.push({
                        name,
                        query: query as SuiteQLQueryInput,
                        columns: readStringArray(cte, 'columns'),
                        recursive: cte.recursive === true
                    });
                }
            });
            return;
        }

        if (!isObject(ctes)) return;

        for (const name in ctes) {
            const cte = ctes[name];

            if (isObject(cte) && cte.query !== undefined) {
                this.cteClauses.push({
                    name,
                    query: cte.query as SuiteQLQueryInput,
                    columns: readStringArray(cte, 'columns'),
                    recursive: cte.recursive === true
                });
            } else {
                this.cteClauses.push({name, query: cte as SuiteQLQueryInput});
            }
        }
    }

    private applyBuilderSelectObject(select: QueryObject): void {
        for (const fieldName in select) {
            const fieldInfo = select[fieldName];

            if (typeof fieldInfo === 'string') {
                this.select(fieldName, fieldInfo);
                continue;
            }

            if (isObject(fieldInfo)) {
                this.select(readRelName(fieldInfo) || fieldName, readString(fieldInfo, 'as'));
                continue;
            }

            this.select(fieldName);
        }
    }

    private applySelectObject(select: QueryObject): void {
        for (const fieldName in select) {
            const fieldInfo = select[fieldName];
            const key = fieldName.toUpperCase();

            if (key.indexOf('EXPRESSION') === 0) {
                if (isObject(fieldInfo)) {
                    this.selectRaw(readRelName(fieldInfo), readString(fieldInfo, 'as'));
                } else {
                    this.selectRaw(String(fieldInfo));
                }
                continue;
            }

            if (key.indexOf('SUBQUERY') === 0 && isObject(fieldInfo)) {
                const alias = readString(fieldInfo, 'as');
                if (alias) this.selectSubquery(fieldInfo, alias);
                continue;
            }

            if (isObject(fieldInfo)) {
                this.select(readRelName(fieldInfo) || fieldName, readString(fieldInfo, 'as'));
                continue;
            }

            if (typeof fieldInfo === 'string') {
                this.selectRaw(`${fieldName} ${fieldInfo}`);
                continue;
            }

            this.select(fieldName);
        }
    }

    private applyFromObject(from: QueryObject): void {
        for (const tableName in from) {
            const tableInfo = from[tableName];
            const key = tableName.toUpperCase();

            if (key.indexOf('EXPRESSION') === 0) {
                this.fromRaw(isObject(tableInfo) ? readRelName(tableInfo) : String(tableInfo));
                continue;
            }

            if (key.indexOf('SUBQUERY') === 0 && isObject(tableInfo)) {
                const alias = readString(tableInfo, 'as');
                if (alias) this.fromSubquery(tableInfo, alias);
                continue;
            }

            if (isJoinKey(key) && isObject(tableInfo)) {
                this.applyJoinObject(toJoinType(key), tableInfo);
                continue;
            }

            if (isObject(tableInfo)) {
                this.from(readRelName(tableInfo) || tableName, readString(tableInfo, 'as'));
                continue;
            }

            if (typeof tableInfo === 'string') {
                this.fromRaw(`${tableName} ${tableInfo}`);
                continue;
            }

            this.from(tableName);
        }
    }

    private applyJoinObject(type: SuiteQLJoinType, join: QueryObject): void {
        for (const tableName in join) {
            const tableInfo = join[tableName];
            const key = tableName.toUpperCase();

            if (key.indexOf('EXPRESSION') === 0) {
                if (isObject(tableInfo)) {
                    const table = readString(tableInfo, 'table') || readRelName(tableInfo);
                    this.joinClauses.push({
                        type,
                        expression: table,
                        alias: readString(tableInfo, 'as'),
                        on: readString(tableInfo, 'on')
                    });
                } else {
                    this.joinRaw(String(tableInfo));
                }
                continue;
            }

            if (key.indexOf('SUBQUERY') === 0 && isObject(tableInfo)) {
                this.joinClauses.push({
                    type,
                    expression: `(${renderQueryInput(tableInfo, {dialect: this.dialect})})`,
                    alias: readString(tableInfo, 'as'),
                    on: readString(tableInfo, 'on')
                });
                continue;
            }

            if (isObject(tableInfo)) {
                this.joinClauses.push({
                    type,
                    expression: readRelName(tableInfo) || tableName,
                    alias: readString(tableInfo, 'as'),
                    on: readString(tableInfo, 'on')
                });
            }
        }
    }

    private applyWhereObject(where: QueryObject | string): void {
        if (typeof where === 'string') {
            this.whereRaw(where);
            return;
        }

        this.applyConditionObject(where, (gate, expression) => this.addWhere(gate, expression));
    }

    private applyHavingObject(having: QueryObject | string): void {
        if (typeof having === 'string') {
            this.havingRaw(having);
            return;
        }

        this.applyConditionObject(having, (gate, expression) => this.addHaving(gate, expression));
    }

    private applyQualifyObject(qualify: QueryObject | string): void {
        if (typeof qualify === 'string') {
            this.qualifyRaw(qualify);
            return;
        }

        this.applyConditionObject(qualify, (gate, expression) => this.addQualify(gate, expression));
    }

    private applyWindowObject(window: QueryObject | string[]): void {
        if (Array.isArray(window)) {
            window.forEach((expression, index) => this.window(`window_${index + 1}`, expression));
            return;
        }

        for (const name in window) {
            const spec = window[name];
            if (typeof spec === 'string') {
                this.window(name, spec);
            } else if (isObject(spec)) {
                this.window(name, {
                    partitionBy: readStringOrStringArray(spec, 'partitionBy'),
                    orderBy: readStringOrStringArray(spec, 'orderBy'),
                    frame: readString(spec, 'frame')
                });
            }
        }
    }

    private applyConditionObject(where: QueryObject, add: (gate: SuiteQLGate, expression: string) => this): void {
        for (const fieldName in where) {
            const fieldInfo = where[fieldName];
            const key = fieldName.toUpperCase();

            if (key.indexOf('EXPRESSION') === 0) {
                add('AND', String(fieldInfo));
                continue;
            }

            if (key.indexOf('SUBQUERY') === 0 && isObject(fieldInfo)) {
                add('AND', `(${renderQueryInput(fieldInfo, {dialect: this.dialect})})`);
                continue;
            }

            if (key.indexOf('EXISTS') === 0) {
                add(readGate(fieldInfo), `EXISTS ${renderExistsInput(fieldInfo, this.dialect)}`);
                continue;
            }

            if (key.indexOf('NOTEXISTS') === 0) {
                add(readGate(fieldInfo), `NOT EXISTS ${renderExistsInput(fieldInfo, this.dialect)}`);
                continue;
            }

            if (isObject(fieldInfo)) {
                const field = readRelName(fieldInfo) || fieldName;
                const operator = readString(fieldInfo, 'operator');
                const value = Object.prototype.hasOwnProperty.call(fieldInfo, 'value')
                    ? raw(String(fieldInfo.value))
                    : undefined;
                const condition = operator ? buildPredicate(field, operator, value) : field;
                add(readGate(fieldInfo), condition);
            }
        }
    }
}

function renderCteClause(clause: CteClause, dialect: SuiteQLDialect): string {
    const columns = clause.columns && clause.columns.length ? ` (${clause.columns.join(', ')})` : '';
    return `${clause.name}${columns} AS (${renderQueryInput(clause.query, {dialect})})`;
}

function renderSelectClause(clause: SelectClause): string {
    return clause.alias ? `${clause.expression} as ${clause.alias}` : clause.expression;
}

function renderSourceClause(clause: SourceClause, dialect: SuiteQLDialect): string {
    if (!clause.alias) return clause.expression;
    return dialect === 'oracle' ? `${clause.expression} ${clause.alias}` : `${clause.expression} as ${clause.alias}`;
}

function renderJoinClause(clause: JoinClause, dialect: SuiteQLDialect): string {
    if (clause.raw) return clause.expression;

    const parts = [clause.type || 'JOIN', clause.expression];
    if (clause.alias) {
        if (dialect === 'oracle') {
            parts.push(clause.alias);
        } else {
            parts.push('as', clause.alias);
        }
    }
    if (clause.on) parts.push('ON', clause.on);
    return parts.join(' ');
}

function renderWhereClause(clause: WhereClause, index: number): string {
    return index === 0 ? clause.expression : `${clause.gate} ${clause.expression}`;
}

function renderWindowClause(clause: WindowClause): string {
    return `${clause.name} AS (${renderWindowSpec(clause.spec)})`;
}

function renderQueryInput(input: SuiteQLQueryInput, options: SuiteQLBuilderOptions = {}): string {
    if (typeof input === 'string') return input.trim();
    if (input instanceof SuiteQLQueryBuilder) return input.toSuiteQL();
    return SuiteQLQueryBuilder.fromObject(input, options).toSuiteQL();
}

function renderExistsInput(input: unknown, dialect: SuiteQLDialect): string {
    if (typeof input === 'string') return input.trim();
    if (isObject(input)) return `(${renderQueryInput(input, {dialect})})`;
    return String(input);
}

function renderListOrSubquery(input: SuiteQLValue[] | SuiteQLQueryInput, dialect: SuiteQLDialect): string {
    if (Array.isArray(input)) return formatValue(input);
    if (input instanceof SuiteQLQueryBuilder || isObject(input)) return `(${renderQueryInput(input, {dialect})})`;
    return `(${String(input).trim()})`;
}

function renderWindowSpec(spec: string | SuiteQLWindowSpec): string {
    if (typeof spec === 'string') return spec.trim();

    const parts: string[] = [];
    const partitionBy = flattenOptionalStrings(spec.partitionBy);
    const orderBy = flattenOptionalStrings(spec.orderBy);

    if (partitionBy.length) {
        parts.push('PARTITION BY', partitionBy.join(', '));
    }

    if (orderBy.length) {
        parts.push('ORDER BY', orderBy.join(', '));
    }

    if (spec.frame) {
        parts.push(spec.frame);
    }

    return parts.join(' ');
}

function renderOverClause(spec: string | SuiteQLWindowSpec): string {
    if (typeof spec === 'string') {
        const trimmed = spec.trim();
        if (!trimmed) return 'OVER ()';
        if (trimmed.toUpperCase().startsWith('OVER ')) return trimmed;
        if (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(trimmed)) return `OVER ${trimmed}`;
        return `OVER (${trimmed})`;
    }

    return `OVER (${renderWindowSpec(spec)})`;
}

function buildPredicate(field: string, operator: string, value?: SuiteQLValue): string {
    if (value === undefined) return `${field} ${operator}`;
    return `${field} ${operator} ${formatValue(value)}`;
}

function formatValue(value: SuiteQLValue): string {
    if (isRaw(value)) return value.value;

    if (Array.isArray(value)) {
        return `(${value.map(formatValue).join(', ')})`;
    }

    if (value instanceof Date) {
        return quote(value.toISOString());
    }

    if (value === null) return 'NULL';

    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }

    if (typeof value === 'boolean') {
        return value ? "'T'" : "'F'";
    }

    return quote(value);
}

function quote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function flattenStrings(values: Array<string | string[]>): string[] {
    return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

function flattenOptionalStrings(value?: string | string[]): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function isRaw(value: unknown): value is SuiteQLRaw {
    return isObject(value) && value.__suiteQLRaw === true && typeof value.value === 'string';
}

function isObject(value: unknown): value is QueryObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(obj: QueryObject, key: string): string | undefined {
    const value = obj[key];
    return typeof value === 'string' && value ? value : undefined;
}

function readStringArray(obj: QueryObject, key: string): string[] | undefined {
    const value = obj[key];
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function readStringOrStringArray(obj: QueryObject, key: string): string | string[] | undefined {
    return readString(obj, key) || readStringArray(obj, key);
}

function readRelName(obj: QueryObject): string {
    return readString(obj, 'name') || readString(obj, 'table') || readString(obj, 'field') || readString(obj, 'expression') || '';
}

function readGate(value: unknown): SuiteQLGate {
    if (isObject(value) && String(value.gate).toUpperCase() === 'OR') return 'OR';
    return 'AND';
}

function isJoinKey(key: string): boolean {
    return (
        key === 'JOIN' ||
        key === 'LEFTJOIN' ||
        key === 'LEFTOUTERJOIN' ||
        key === 'RIGHTJOIN' ||
        key === 'RIGHTOUTERJOIN' ||
        key === 'INNERJOIN' ||
        key === 'OUTERJOIN' ||
        key === 'FULLJOIN' ||
        key === 'FULLOUTERJOIN' ||
        key === 'CROSSJOIN'
    );
}

function toJoinType(key: string): SuiteQLJoinType {
    switch (key) {
        case 'JOIN':
            return 'LEFT JOIN';
        case 'LEFTJOIN':
            return 'LEFT JOIN';
        case 'LEFTOUTERJOIN':
            return 'LEFT OUTER JOIN';
        case 'RIGHTJOIN':
            return 'RIGHT JOIN';
        case 'RIGHTOUTERJOIN':
            return 'RIGHT OUTER JOIN';
        case 'INNERJOIN':
            return 'INNER JOIN';
        case 'OUTERJOIN':
            return 'OUTER JOIN';
        case 'FULLJOIN':
            return 'FULL JOIN';
        case 'FULLOUTERJOIN':
            return 'FULL OUTER JOIN';
        case 'CROSSJOIN':
            return 'CROSS JOIN';
        default:
            return 'JOIN';
    }
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}
