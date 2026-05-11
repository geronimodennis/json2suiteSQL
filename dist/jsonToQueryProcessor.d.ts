/**
 * Query object accepted by jsonToSuiteQL.
 *
 * Most clauses are plain objects because field, table, expression, and alias
 * names are intentionally supplied by the caller as SuiteQL fragments.
 */
export interface JsonToSuiteQLQuery {
    select?: QueryObject;
    from?: QueryObject;
    where?: QueryObject | string;
    groupBy?: string[];
    orderBy?: string[];
    union?: Array<JsonToSuiteQLQuery | string>;
    unionAll?: Array<JsonToSuiteQLQuery | string>;
    as?: string;
    gate?: string;
    [key: string]: any;
}
type QueryObject = Record<string, any>;
export { jsonToSuiteQL };
declare function jsonToSuiteQL(jsonQuery?: JsonToSuiteQLQuery): string;
