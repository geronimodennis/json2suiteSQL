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
export { jsonToSuiteQL, jsonToSuiteQLWithParams, namedParam, prepareSuiteQL };
declare function jsonToSuiteQL(jsonQuery?: JsonToSuiteQLQuery): string;
declare function jsonToSuiteQLWithParams(jsonQuery?: JsonToSuiteQLQuery, params?: SuiteQLParamInput): SuiteQLPreparedQuery;
declare function prepareSuiteQL(query: string, params?: SuiteQLParamInput): SuiteQLPreparedQuery;
declare function namedParam(name: string): string;
