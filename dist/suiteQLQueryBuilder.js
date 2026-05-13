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
export function raw(value) {
    return Object.freeze({ __suiteQLRaw: true, value });
}
export function param(name) {
    return raw(name ? namedParam(name) : '?');
}
export function suiteQL() {
    return new SuiteQLQueryBuilder();
}
export function sql(options = {}) {
    return new SuiteQLQueryBuilder(options);
}
export function oracleSQL() {
    return new SuiteQLQueryBuilder({ dialect: 'oracle' });
}
export function suiteQLFromObject(query) {
    return SuiteQLQueryBuilder.fromObject(query);
}
export function oracleSQLFromObject(query) {
    return SuiteQLQueryBuilder.fromObject(query, { dialect: 'oracle' });
}
export function over(spec = '') {
    return renderOverClause(spec);
}
export function namedParam(name) {
    if (!isValidParamName(name)) {
        throw new Error(`Invalid SuiteQL parameter name "${name}". Use letters, numbers, and underscores, starting with a letter or underscore.`);
    }
    return `:${name}`;
}
export function prepareSuiteQL(query, params = {}) {
    if (Array.isArray(params)) {
        return { query, params: [...params], paramNames: [] };
    }
    return convertNamedParamsToPositional(query, params);
}
export class SuiteQLQueryBuilder {
    constructor(options = {}) {
        this.selectModifier = '';
        this.cteClauses = [];
        this.selectClauses = [];
        this.sourceClauses = [];
        this.joinClauses = [];
        this.whereClauses = [];
        this.startWithClauses = [];
        this.connectByClauses = [];
        this.groupByClauses = [];
        this.havingClauses = [];
        this.windowClauses = [];
        this.qualifyClauses = [];
        this.orderByClauses = [];
        this.setClauses = [];
        this.offsetClause = '';
        this.forUpdateClause = '';
        this.dialect = options.dialect || 'suiteql';
    }
    static fromObject(query, options = {}) {
        const builder = new SuiteQLQueryBuilder(options);
        if (!isObject(query))
            return builder;
        assertReadOnlyQuery(query);
        if (query.with) {
            builder.applyCteObject(query.with);
        }
        if (query.distinct) {
            builder.distinct();
        }
        else if (query.all) {
            builder.selectAll();
        }
        if (query.select) {
            builder.applySelectInput(query.select);
        }
        if (query.from) {
            builder.applyFromInput(query.from);
        }
        if (query.where) {
            builder.applyWhereInput(query.where);
        }
        if (query.groupBy) {
            builder.groupByClauses.push(...renderClauseListInput(query.groupBy));
        }
        if (query.having) {
            builder.applyHavingInput(query.having);
        }
        if (query.window) {
            builder.applyWindowObject(query.window);
        }
        if (query.qualify) {
            builder.applyQualifyInput(query.qualify);
        }
        if (query.orderBy) {
            builder.orderByClauses.push(...renderClauseListInput(query.orderBy));
        }
        if (query.offset !== undefined) {
            builder.offset(query.offset);
        }
        if (query.fetch !== undefined) {
            if (isObject(query.fetch) && query.fetch.rows !== undefined) {
                builder.fetchFirst(query.fetch.rows, { percent: query.fetch.percent, withTies: query.fetch.withTies });
            }
            else {
                builder.fetchFirst(query.fetch);
            }
        }
        else if (query.limit !== undefined) {
            builder.limit(query.limit);
        }
        if (query.forUpdate !== undefined) {
            builder.forUpdate(query.forUpdate === true ? undefined : String(query.forUpdate));
        }
        if (query.startWith) {
            builder.applyStartWithInput(query.startWith);
        }
        if (query.connectBy) {
            builder.applyConnectByInput(query.connectBy);
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
    with(name, query, columns) {
        return this.withCte(name, query, columns);
    }
    withCte(name, query, columns) {
        this.cteClauses.push({ name, query, columns });
        return this;
    }
    withRecursive(name, query, columns) {
        this.cteClauses.push({ name, query, columns, recursive: true });
        return this;
    }
    distinct() {
        this.selectModifier = 'DISTINCT';
        return this;
    }
    selectDistinct() {
        return this.distinct();
    }
    selectAll() {
        this.selectModifier = 'ALL';
        return this;
    }
    select(fieldOrFields, alias) {
        if (typeof fieldOrFields === 'string') {
            this.selectClauses.push({ expression: fieldOrFields, alias });
            return this;
        }
        if (Array.isArray(fieldOrFields)) {
            fieldOrFields.forEach((field) => this.select(field));
            return this;
        }
        this.applyBuilderSelectObject(fieldOrFields);
        return this;
    }
    selectAs(expression, alias) {
        return this.select(expression, alias);
    }
    selectRaw(expression, alias) {
        this.selectClauses.push({ expression, alias });
        return this;
    }
    selectSubquery(query, alias) {
        this.selectClauses.push({ expression: `(${renderQueryInput(query, { dialect: this.dialect })})`, alias });
        return this;
    }
    selectWindow(expression, spec = '', alias) {
        this.selectClauses.push({ expression: `${expression} ${renderOverClause(spec)}`, alias });
        return this;
    }
    rowNumber(alias, spec = '') {
        return this.selectWindow('ROW_NUMBER()', spec, alias);
    }
    rank(alias, spec = '') {
        return this.selectWindow('RANK()', spec, alias);
    }
    denseRank(alias, spec = '') {
        return this.selectWindow('DENSE_RANK()', spec, alias);
    }
    from(source, alias) {
        if (typeof source === 'string') {
            this.sourceClauses.push({ expression: source, alias });
            return this;
        }
        this.sourceClauses.push({ expression: `(${renderQueryInput(source, { dialect: this.dialect })})`, alias });
        return this;
    }
    fromRaw(expression) {
        this.sourceClauses.push({ expression });
        return this;
    }
    fromSubquery(query, alias) {
        this.sourceClauses.push({ expression: `(${renderQueryInput(query, { dialect: this.dialect })})`, alias });
        return this;
    }
    join(source, aliasOrOn, on) {
        return this.addJoin('JOIN', source, aliasOrOn, on);
    }
    leftJoin(source, aliasOrOn, on) {
        return this.addJoin('LEFT JOIN', source, aliasOrOn, on);
    }
    rightJoin(source, aliasOrOn, on) {
        return this.addJoin('RIGHT JOIN', source, aliasOrOn, on);
    }
    innerJoin(source, aliasOrOn, on) {
        return this.addJoin('INNER JOIN', source, aliasOrOn, on);
    }
    outerJoin(source, aliasOrOn, on) {
        return this.addJoin('OUTER JOIN', source, aliasOrOn, on);
    }
    fullJoin(source, aliasOrOn, on) {
        return this.addJoin('FULL JOIN', source, aliasOrOn, on);
    }
    fullOuterJoin(source, aliasOrOn, on) {
        return this.addJoin('FULL OUTER JOIN', source, aliasOrOn, on);
    }
    crossJoin(source, aliasOrOn, on) {
        return this.addJoin('CROSS JOIN', source, aliasOrOn, on);
    }
    joinAs(type, source, aliasOrOn, on) {
        return this.addJoin(type, source, aliasOrOn, on);
    }
    joinRaw(expression) {
        this.joinClauses.push({ expression, raw: true });
        return this;
    }
    where(field, operator, value) {
        return this.addWhere('AND', buildPredicate(field, operator, value));
    }
    andWhere(field, operator, value) {
        return this.where(field, operator, value);
    }
    orWhere(field, operator, value) {
        return this.addWhere('OR', buildPredicate(field, operator, value));
    }
    whereRaw(expression) {
        return this.addWhere('AND', expression);
    }
    andWhereRaw(expression) {
        return this.whereRaw(expression);
    }
    orWhereRaw(expression) {
        return this.addWhere('OR', expression);
    }
    whereIn(field, values) {
        return this.addWhere('AND', `${field} IN ${renderListOrSubquery(values, this.dialect)}`);
    }
    orWhereIn(field, values) {
        return this.addWhere('OR', `${field} IN ${renderListOrSubquery(values, this.dialect)}`);
    }
    whereNotIn(field, values) {
        return this.addWhere('AND', `${field} NOT IN ${renderListOrSubquery(values, this.dialect)}`);
    }
    whereBetween(field, start, end) {
        return this.addWhere('AND', `${field} BETWEEN ${formatValue(start)} AND ${formatValue(end)}`);
    }
    whereNull(field) {
        return this.addWhere('AND', `${field} IS NULL`);
    }
    whereNotNull(field) {
        return this.addWhere('AND', `${field} IS NOT NULL`);
    }
    exists(query) {
        return this.addWhere('AND', `EXISTS (${renderQueryInput(query, { dialect: this.dialect })})`);
    }
    orExists(query) {
        return this.addWhere('OR', `EXISTS (${renderQueryInput(query, { dialect: this.dialect })})`);
    }
    notExists(query) {
        return this.addWhere('AND', `NOT EXISTS (${renderQueryInput(query, { dialect: this.dialect })})`);
    }
    orNotExists(query) {
        return this.addWhere('OR', `NOT EXISTS (${renderQueryInput(query, { dialect: this.dialect })})`);
    }
    groupBy(...fields) {
        this.groupByClauses.push(...flattenStrings(fields));
        return this;
    }
    rollup(...fields) {
        this.groupByClauses.push(`ROLLUP (${flattenStrings(fields).join(', ')})`);
        return this;
    }
    cube(...fields) {
        this.groupByClauses.push(`CUBE (${flattenStrings(fields).join(', ')})`);
        return this;
    }
    groupingSets(...sets) {
        const renderedSets = sets.map((set) => (Array.isArray(set) ? `(${set.join(', ')})` : `(${set})`));
        this.groupByClauses.push(`GROUPING SETS (${renderedSets.join(', ')})`);
        return this;
    }
    having(field, operator, value) {
        return this.addHaving('AND', buildPredicate(field, operator, value));
    }
    andHaving(field, operator, value) {
        return this.having(field, operator, value);
    }
    orHaving(field, operator, value) {
        return this.addHaving('OR', buildPredicate(field, operator, value));
    }
    havingRaw(expression) {
        return this.addHaving('AND', expression);
    }
    orHavingRaw(expression) {
        return this.addHaving('OR', expression);
    }
    window(name, spec) {
        this.windowClauses.push({ name, spec });
        return this;
    }
    qualify(field, operator, value) {
        return this.addQualify('AND', buildPredicate(field, operator, value));
    }
    qualifyRaw(expression) {
        return this.addQualify('AND', expression);
    }
    orQualifyRaw(expression) {
        return this.addQualify('OR', expression);
    }
    orderBy(...fields) {
        this.orderByClauses.push(...flattenStrings(fields));
        return this;
    }
    orderByColumn(field, direction = 'ASC', nulls) {
        this.orderByClauses.push([field, direction, nulls].filter(Boolean).join(' '));
        return this;
    }
    offset(rows) {
        this.offsetClause = String(rows);
        return this;
    }
    fetchFirst(rows, options = {}) {
        this.fetchClause = { rows: String(rows), percent: options.percent, withTies: options.withTies };
        return this;
    }
    limit(rows) {
        return this.fetchFirst(rows);
    }
    forUpdate(options = '') {
        this.forUpdateClause = options;
        return this;
    }
    startWith(expression) {
        this.startWithClauses.push({ gate: 'AND', expression });
        return this;
    }
    connectBy(expression, nocycle = false) {
        this.connectByClauses.push({ gate: 'AND', expression: nocycle ? `NOCYCLE ${expression}` : expression });
        return this;
    }
    union(...queries) {
        return this.setOperator('UNION', ...queries);
    }
    unionAll(...queries) {
        return this.setOperator('UNION ALL', ...queries);
    }
    intersect(...queries) {
        return this.setOperator('INTERSECT', ...queries);
    }
    intersectAll(...queries) {
        return this.setOperator('INTERSECT ALL', ...queries);
    }
    minus(...queries) {
        return this.setOperator('MINUS', ...queries);
    }
    minusAll(...queries) {
        return this.setOperator('MINUS ALL', ...queries);
    }
    except(...queries) {
        return this.setOperator('EXCEPT', ...queries);
    }
    exceptAll(...queries) {
        return this.setOperator('EXCEPT ALL', ...queries);
    }
    setOperator(type, ...queries) {
        queries.forEach((query) => this.setClauses.push({ type, query }));
        return this;
    }
    toSQL() {
        return this.toSuiteQL();
    }
    toOracleSQL() {
        return this.toSuiteQL();
    }
    toParameterizedSQL(params = {}) {
        return prepareSuiteQL(this.toSuiteQL(), params);
    }
    toParameterizedSuiteQL(params = {}) {
        return this.toParameterizedSQL(params);
    }
    toParameterizedOracleSQL(params = {}) {
        return this.toParameterizedSQL(params);
    }
    clone() {
        const builder = new SuiteQLQueryBuilder({ dialect: this.dialect });
        builder.selectModifier = this.selectModifier;
        builder.cteClauses.push(...this.cteClauses.map((clause) => ({ ...clause, columns: clause.columns ? [...clause.columns] : undefined })));
        builder.selectClauses.push(...this.selectClauses.map((clause) => ({ ...clause })));
        builder.sourceClauses.push(...this.sourceClauses.map((clause) => ({ ...clause })));
        builder.joinClauses.push(...this.joinClauses.map((clause) => ({ ...clause })));
        builder.whereClauses.push(...this.whereClauses.map((clause) => ({ ...clause })));
        builder.startWithClauses.push(...this.startWithClauses.map((clause) => ({ ...clause })));
        builder.connectByClauses.push(...this.connectByClauses.map((clause) => ({ ...clause })));
        builder.groupByClauses.push(...this.groupByClauses);
        builder.havingClauses.push(...this.havingClauses.map((clause) => ({ ...clause })));
        builder.windowClauses.push(...this.windowClauses.map((clause) => ({ ...clause })));
        builder.qualifyClauses.push(...this.qualifyClauses.map((clause) => ({ ...clause })));
        builder.orderByClauses.push(...this.orderByClauses);
        builder.setClauses.push(...this.setClauses.map((clause) => ({ ...clause })));
        builder.offsetClause = this.offsetClause;
        builder.fetchClause = this.fetchClause ? { ...this.fetchClause } : undefined;
        builder.forUpdateClause = this.forUpdateClause;
        return builder;
    }
    toSuiteQL() {
        const hasSetClauses = this.setClauses.length > 0;
        const baseQuery = this.renderQueryBlock(!hasSetClauses);
        const setQuery = this.renderSetQuery(baseQuery);
        const finalQuery = hasSetClauses ? [setQuery || baseQuery, this.renderFinalClauses()].filter(Boolean).join(' ') : setQuery || baseQuery;
        return normalizeWhitespace([this.renderWithClause(), finalQuery].filter(Boolean).join(' '));
    }
    toString() {
        return this.toSuiteQL();
    }
    addJoin(type, source, aliasOrOn, on) {
        const expression = typeof source === 'string' ? source : `(${renderQueryInput(source, { dialect: this.dialect })})`;
        const alias = on ? aliasOrOn : undefined;
        const joinOn = on || aliasOrOn;
        this.joinClauses.push({ type, expression, alias, on: joinOn });
        return this;
    }
    addWhere(gate, expression) {
        this.whereClauses.push({ gate, expression });
        return this;
    }
    addHaving(gate, expression) {
        this.havingClauses.push({ gate, expression });
        return this;
    }
    addQualify(gate, expression) {
        this.qualifyClauses.push({ gate, expression });
        return this;
    }
    renderWithClause() {
        if (!this.cteClauses.length)
            return '';
        const hasRecursive = this.cteClauses.some((clause) => clause.recursive);
        const withKeyword = hasRecursive && this.dialect === 'ansi' ? 'WITH RECURSIVE' : 'WITH';
        return `${withKeyword} ${this.cteClauses.map((clause) => renderCteClause(clause, this.dialect)).join(', ')}`;
    }
    renderQueryBlock(includeFinalClauses) {
        const parts = [];
        if (this.selectClauses.length) {
            parts.push('SELECT');
            if (this.selectModifier)
                parts.push(this.selectModifier);
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
            if (finalClauses)
                parts.push(finalClauses);
        }
        return parts.join(' ');
    }
    renderFinalClauses() {
        const parts = [];
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
    renderSetQuery(baseQuery) {
        if (!this.setClauses.length)
            return '';
        if (!baseQuery) {
            const [firstClause, ...remainingClauses] = this.setClauses;
            if (!firstClause)
                return '';
            const firstQuery = renderQueryInput(firstClause.query, { dialect: this.dialect });
            const rest = remainingClauses.map((clause) => `${clause.type} ${renderQueryInput(clause.query, { dialect: this.dialect })}`);
            return [firstQuery, ...rest].join(' ');
        }
        const rest = this.setClauses.map((clause) => `${clause.type} ${renderQueryInput(clause.query, { dialect: this.dialect })}`);
        return [baseQuery, ...rest].join(' ');
    }
    applyCteObject(ctes) {
        if (Array.isArray(ctes)) {
            ctes.forEach((cte) => {
                if (!isObject(cte))
                    return;
                const name = readString(cte, 'name');
                const query = cte.query;
                if (name && query !== undefined) {
                    this.cteClauses.push({
                        name,
                        query: query,
                        columns: readStringArray(cte, 'columns'),
                        recursive: cte.recursive === true
                    });
                }
            });
            return;
        }
        if (!isObject(ctes))
            return;
        for (const name in ctes) {
            const cte = ctes[name];
            if (isObject(cte) && cte.query !== undefined) {
                this.cteClauses.push({
                    name,
                    query: cte.query,
                    columns: readStringArray(cte, 'columns'),
                    recursive: cte.recursive === true
                });
            }
            else {
                this.cteClauses.push({ name, query: cte });
            }
        }
    }
    applyBuilderSelectObject(select) {
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
    applySelectInput(select) {
        if (typeof select === 'string') {
            this.selectRaw(select);
            return;
        }
        if (Array.isArray(select)) {
            select.forEach((field) => this.select(field));
            return;
        }
        if (isObject(select)) {
            this.applySelectObject(select);
        }
    }
    applySelectObject(select) {
        for (const fieldName in select) {
            const fieldInfo = select[fieldName];
            const key = normalizeKey(fieldName);
            if (key.indexOf('EXPRESSION') === 0) {
                if (isObject(fieldInfo)) {
                    this.selectRaw(renderAnalyticExpression(readRelName(fieldInfo) || fieldName, fieldInfo), readString(fieldInfo, 'as'));
                }
                else {
                    this.selectRaw(String(fieldInfo));
                }
                continue;
            }
            if (key.indexOf('SUBQUERY') === 0) {
                const query = isObject(fieldInfo) && Object.prototype.hasOwnProperty.call(fieldInfo, 'query') ? fieldInfo.query : fieldInfo;
                this.selectClauses.push({
                    expression: `(${renderQueryInput(query, { dialect: this.dialect })})`,
                    alias: isObject(fieldInfo) ? readString(fieldInfo, 'as') : undefined
                });
                continue;
            }
            if (isObject(fieldInfo)) {
                this.selectRaw(renderAnalyticExpression(readRelName(fieldInfo) || fieldName, fieldInfo), readString(fieldInfo, 'as'));
                continue;
            }
            if (typeof fieldInfo === 'string') {
                this.selectRaw(`${fieldName} ${fieldInfo}`);
                continue;
            }
            this.select(fieldName);
        }
    }
    applyFromInput(from) {
        if (typeof from === 'string') {
            this.fromRaw(from);
            return;
        }
        if (isObject(from)) {
            this.applyFromObject(from);
        }
    }
    applyFromObject(from) {
        for (const tableName in from) {
            const tableInfo = from[tableName];
            const key = normalizeKey(tableName);
            if (key.indexOf('EXPRESSION') === 0) {
                this.fromRaw(isObject(tableInfo) ? readRelName(tableInfo) : String(tableInfo));
                continue;
            }
            if (key.indexOf('SUBQUERY') === 0 && isObject(tableInfo)) {
                const query = Object.prototype.hasOwnProperty.call(tableInfo, 'query') ? tableInfo.query : tableInfo;
                this.sourceClauses.push({
                    expression: `(${renderQueryInput(query, { dialect: this.dialect })})`,
                    alias: readString(tableInfo, 'as')
                });
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
    applyJoinObject(type, join) {
        for (const tableName in join) {
            const tableInfo = join[tableName];
            const key = normalizeKey(tableName);
            if (key.indexOf('EXPRESSION') === 0) {
                if (isObject(tableInfo)) {
                    const table = readString(tableInfo, 'table') || readRelName(tableInfo);
                    this.joinClauses.push({
                        type,
                        expression: table,
                        alias: readString(tableInfo, 'as'),
                        on: readString(tableInfo, 'on'),
                        using: renderOptionalUsingClause(tableInfo.using)
                    });
                }
                else {
                    this.joinRaw(String(tableInfo));
                }
                continue;
            }
            if (key.indexOf('SUBQUERY') === 0 && isObject(tableInfo)) {
                const query = Object.prototype.hasOwnProperty.call(tableInfo, 'query') ? tableInfo.query : tableInfo;
                this.joinClauses.push({
                    type,
                    expression: `(${renderQueryInput(query, { dialect: this.dialect })})`,
                    alias: readString(tableInfo, 'as'),
                    on: readString(tableInfo, 'on'),
                    using: renderOptionalUsingClause(tableInfo.using)
                });
                continue;
            }
            if (isObject(tableInfo)) {
                this.joinClauses.push({
                    type,
                    expression: readRelName(tableInfo) || tableName,
                    alias: readString(tableInfo, 'as'),
                    on: readString(tableInfo, 'on'),
                    using: renderOptionalUsingClause(tableInfo.using)
                });
            }
        }
    }
    applyWhereInput(where) {
        this.applyConditionInput(where, (gate, expression) => this.addWhere(gate, expression));
    }
    applyHavingInput(having) {
        this.applyConditionInput(having, (gate, expression) => this.addHaving(gate, expression));
    }
    applyQualifyInput(qualify) {
        this.applyConditionInput(qualify, (gate, expression) => this.addQualify(gate, expression));
    }
    applyStartWithInput(startWith) {
        this.applyConditionInput(startWith, (gate, expression) => {
            this.startWithClauses.push({ gate, expression });
            return this;
        });
    }
    applyConnectByInput(connectBy) {
        this.applyConditionInput(connectBy, (gate, expression) => {
            this.connectByClauses.push({ gate, expression });
            return this;
        });
    }
    applyConditionInput(input, add) {
        if (typeof input === 'string') {
            add('AND', input.trim());
            return;
        }
        if (Array.isArray(input)) {
            add('AND', input.join(' '));
            return;
        }
        if (isObject(input)) {
            this.applyConditionObject(input, add);
        }
    }
    applyWindowObject(window) {
        if (Array.isArray(window)) {
            window.forEach((expression, index) => this.window(`window_${index + 1}`, expression));
            return;
        }
        for (const name in window) {
            const spec = window[name];
            if (typeof spec === 'string') {
                this.window(name, spec);
            }
            else if (isObject(spec)) {
                this.window(name, {
                    partitionBy: readStringOrStringArray(spec, 'partitionBy'),
                    orderBy: readStringOrStringArray(spec, 'orderBy'),
                    frame: readString(spec, 'frame')
                });
            }
        }
    }
    applyConditionObject(where, add) {
        for (const fieldName in where) {
            const fieldInfo = where[fieldName];
            const key = normalizeKey(fieldName);
            if (key.indexOf('EXPRESSION') === 0) {
                add('AND', String(fieldInfo));
                continue;
            }
            if (key.indexOf('SUBQUERY') === 0) {
                const query = isObject(fieldInfo) && Object.prototype.hasOwnProperty.call(fieldInfo, 'query') ? fieldInfo.query : fieldInfo;
                add('AND', `(${renderQueryInput(query, { dialect: this.dialect })})`);
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
            if (!isObject(fieldInfo)) {
                add('AND', `${fieldName} ${String(fieldInfo)}`.trim());
                continue;
            }
            if (isObject(fieldInfo)) {
                const rawValue = readString(fieldInfo, 'raw');
                if (rawValue) {
                    add(readGate(fieldInfo), rawValue);
                    continue;
                }
                const field = readRelName(fieldInfo) || fieldName;
                const operator = readString(fieldInfo, 'operator') || readString(fieldInfo, 'op');
                const value = Object.prototype.hasOwnProperty.call(fieldInfo, 'value')
                    ? this.applyConditionValue(fieldInfo.value)
                    : undefined;
                const condition = operator ? buildPredicate(field, operator, value) : field;
                add(readGate(fieldInfo), condition);
            }
        }
    }
    applyConditionValue(value) {
        if (isObject(value)) {
            const paramName = readString(value, 'param');
            if (paramName)
                return param(paramName);
            const rawValue = readRelName(value);
            if (rawValue && !isQueryLikeObject(value))
                return raw(rawValue);
            if (isQueryLikeObject(value))
                return raw(renderQueryInput(value, { dialect: this.dialect }));
        }
        return value;
    }
}
function renderCteClause(clause, dialect) {
    const columns = clause.columns && clause.columns.length ? ` (${clause.columns.join(', ')})` : '';
    return `${clause.name}${columns} AS (${renderQueryInput(clause.query, { dialect })})`;
}
function renderSelectClause(clause) {
    return clause.alias ? `${clause.expression} as ${clause.alias}` : clause.expression;
}
function renderSourceClause(clause, dialect) {
    if (!clause.alias)
        return clause.expression;
    return dialect === 'oracle' ? `${clause.expression} ${clause.alias}` : `${clause.expression} as ${clause.alias}`;
}
function renderJoinClause(clause, dialect) {
    if (clause.raw)
        return clause.expression;
    const parts = [clause.type || 'JOIN', clause.expression];
    if (clause.alias) {
        if (dialect === 'oracle') {
            parts.push(clause.alias);
        }
        else {
            parts.push('as', clause.alias);
        }
    }
    if (clause.on)
        parts.push('ON', clause.on);
    if (clause.using)
        parts.push('USING', clause.using);
    return parts.join(' ');
}
function renderWhereClause(clause, index) {
    return index === 0 ? clause.expression : `${clause.gate} ${clause.expression}`;
}
function renderWindowClause(clause) {
    return `${clause.name} AS (${renderWindowSpec(clause.spec)})`;
}
function renderAnalyticExpression(expression, fieldInfo) {
    if (!Object.prototype.hasOwnProperty.call(fieldInfo, 'over'))
        return expression;
    return `${expression} ${renderOverClause(fieldInfo.over)}`;
}
function renderQueryInput(input, options = {}) {
    if (typeof input === 'string')
        return input.trim();
    if (input instanceof SuiteQLQueryBuilder)
        return input.toSuiteQL();
    return SuiteQLQueryBuilder.fromObject(input, options).toSuiteQL();
}
function renderExistsInput(input, dialect) {
    if (typeof input === 'string')
        return input.trim();
    if (isObject(input)) {
        const query = Object.prototype.hasOwnProperty.call(input, 'query') ? input.query : input;
        return `(${renderQueryInput(query, { dialect })})`;
    }
    return String(input);
}
function renderListOrSubquery(input, dialect) {
    if (Array.isArray(input))
        return formatValue(input);
    if (isRaw(input))
        return `(${input.value})`;
    if (input instanceof SuiteQLQueryBuilder || isObject(input))
        return `(${renderQueryInput(input, { dialect })})`;
    return `(${String(input).trim()})`;
}
function renderWindowSpec(spec) {
    if (typeof spec === 'string')
        return spec.trim();
    const parts = [];
    const extendedSpec = spec;
    const partitionBy = flattenOptionalStrings(extendedSpec.partitionBy || extendedSpec.partition);
    const orderBy = flattenOptionalStrings(extendedSpec.orderBy || extendedSpec.order);
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
function renderOverClause(spec) {
    if (typeof spec === 'string') {
        const trimmed = spec.trim();
        if (!trimmed)
            return 'OVER ()';
        if (trimmed.toUpperCase().startsWith('OVER '))
            return trimmed;
        if (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(trimmed))
            return `OVER ${trimmed}`;
        return `OVER (${trimmed})`;
    }
    return `OVER (${renderWindowSpec(spec)})`;
}
function convertNamedParamsToPositional(query, params) {
    const output = [];
    const positionalParams = [];
    const paramNames = [];
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
            }
            else {
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
function copyQuotedSection(query, start, output, quote) {
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
function copyLineComment(query, start, output) {
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
function copyBlockComment(query, start, output) {
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
function readNamedParameter(query, start) {
    const marker = query[start];
    if (marker !== ':' && marker !== '@')
        return null;
    if (marker === ':' && query[start + 1] === ':')
        return null;
    const previous = query[start - 1];
    if (previous && isIdentifierPart(previous))
        return null;
    const firstNameChar = query[start + 1];
    if (!isIdentifierStart(firstNameChar))
        return null;
    let end = start + 2;
    while (end < query.length && isIdentifierPart(query[end])) {
        end++;
    }
    return {
        name: query.slice(start + 1, end),
        end
    };
}
function buildPredicate(field, operator, value) {
    if (value === undefined)
        return `${field} ${operator}`;
    const normalizedOperator = operator.trim().toUpperCase();
    if (normalizedOperator === 'BETWEEN' && Array.isArray(value) && value.length >= 2) {
        return `${field} BETWEEN ${formatValue(value[0])} AND ${formatValue(value[1])}`;
    }
    if ((normalizedOperator === 'IN' || normalizedOperator === 'NOT IN') && isRaw(value)) {
        return `${field} ${operator} (${formatValue(value)})`;
    }
    return `${field} ${operator} ${formatValue(value)}`;
}
function renderClauseListInput(input) {
    const rendered = renderClauseListExpression(input);
    return rendered ? [rendered] : [];
}
function renderClauseListExpression(input) {
    if (!input)
        return '';
    if (typeof input === 'string')
        return input.trim();
    if (Array.isArray(input))
        return input.map(renderClauseListItem).filter(Boolean).join(', ');
    if (!isObject(input))
        return '';
    const clauses = [];
    if (input.expression)
        clauses.push(String(input.expression));
    if (input.rollup)
        clauses.push(`ROLLUP (${renderClauseListValue(input.rollup)})`);
    if (input.cube)
        clauses.push(`CUBE (${renderClauseListValue(input.cube)})`);
    if (input.groupingSets)
        clauses.push(`GROUPING SETS (${renderGroupingSets(input.groupingSets)})`);
    for (const key in input) {
        if (['expression', 'rollup', 'cube', 'groupingSets'].includes(key))
            continue;
        const value = input[key];
        if (isObject(value))
            clauses.push(renderOrderByItem(key, value));
        else if (value)
            clauses.push(`${key} ${String(value)}`.trim());
        else
            clauses.push(key);
    }
    return clauses.filter(Boolean).join(', ');
}
function renderClauseListItem(item) {
    if (typeof item === 'string')
        return item;
    if (!isObject(item))
        return '';
    if (item.expression)
        return String(item.expression);
    if (item.field)
        return renderOrderByItem(String(item.field), item);
    return '';
}
function renderClauseListValue(input) {
    if (Array.isArray(input))
        return input.map((item) => String(item)).join(', ');
    return String(input);
}
function renderGroupingSets(input) {
    if (!Array.isArray(input))
        return String(input);
    return input
        .map((set) => (Array.isArray(set) ? `(${set.map((item) => String(item)).join(', ')})` : `(${String(set)})`))
        .join(', ');
}
function renderOrderByItem(field, value) {
    const expression = String(value.expression || value.field || field);
    return [expression, value.direction, value.nulls].filter(Boolean).map((item) => String(item)).join(' ');
}
function renderOptionalUsingClause(value) {
    if (value === undefined || value === null)
        return undefined;
    return renderUsingClause(value);
}
function renderUsingClause(value) {
    if (Array.isArray(value))
        return `(${value.map((item) => String(item)).join(', ')})`;
    const rendered = String(value).trim();
    return rendered.startsWith('(') ? rendered : `(${rendered})`;
}
function formatValue(value) {
    if (isRaw(value))
        return value.value;
    if (Array.isArray(value)) {
        return `(${value.map(formatValue).join(', ')})`;
    }
    if (value instanceof Date) {
        return quote(value.toISOString());
    }
    if (value === null)
        return 'NULL';
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? "'T'" : "'F'";
    }
    return quote(value);
}
function quote(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function flattenStrings(values) {
    return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}
function flattenOptionalStrings(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
function isRaw(value) {
    return isObject(value) && value.__suiteQLRaw === true && typeof value.value === 'string';
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isQueryLikeObject(value) {
    return [
        'with',
        'select',
        'from',
        'where',
        'startWith',
        'connectBy',
        'groupBy',
        'having',
        'window',
        'qualify',
        'orderBy',
        'offset',
        'fetch',
        'limit',
        'union',
        'unionAll',
        'intersect',
        'intersectAll',
        'minus',
        'minusAll',
        'except',
        'exceptAll'
    ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isValidParamName(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
function isIdentifierStart(char) {
    return !!char && /[A-Za-z_]/.test(char);
}
function isIdentifierPart(char) {
    return !!char && /[A-Za-z0-9_]/.test(char);
}
function readString(obj, key) {
    const value = obj[key];
    return typeof value === 'string' && value ? value : undefined;
}
function readStringArray(obj, key) {
    const value = obj[key];
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}
function readStringOrStringArray(obj, key) {
    return readString(obj, key) || readStringArray(obj, key);
}
function readRelName(obj) {
    return readString(obj, 'name') || readString(obj, 'table') || readString(obj, 'field') || readString(obj, 'expression') || '';
}
function readGate(value) {
    if (isObject(value) && String(value.gate).toUpperCase() === 'OR')
        return 'OR';
    return 'AND';
}
function isJoinKey(key) {
    return (key === 'JOIN' ||
        key === 'LEFTJOIN' ||
        key === 'LEFTOUTERJOIN' ||
        key === 'RIGHTJOIN' ||
        key === 'RIGHTOUTERJOIN' ||
        key === 'INNERJOIN' ||
        key === 'OUTERJOIN' ||
        key === 'FULLJOIN' ||
        key === 'FULLOUTERJOIN' ||
        key === 'CROSSJOIN' ||
        key === 'NATURALJOIN');
}
function toJoinType(key) {
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
        case 'NATURALJOIN':
            return 'NATURAL JOIN';
        default:
            return 'JOIN';
    }
}
function assertReadOnlyQuery(query) {
    for (const key of Object.keys(query)) {
        if (READ_ONLY_BLOCKED_KEYS.has(normalizeKey(key))) {
            throw new Error(`SuiteQL is read-only. Unsupported clause "${key}" was provided.`);
        }
    }
}
function normalizeKey(value) {
    return value.replace(/[\s_-]/g, '').toUpperCase();
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
