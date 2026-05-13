# json2suiteSQL

Create SuiteQL strings from JSON-style query objects.

`json2suiteSQL` is a small TypeScript utility for building NetSuite SuiteQL and Oracle-style SQL statements in code without manually concatenating every clause. It includes the original JSON-object processor plus a chainable LINQ-style query builder.

## Why Use This Library?

This library is useful when your application needs to build SuiteQL or Oracle-style SQL dynamically while keeping query construction readable and maintainable.

Key advantages:

- Reduces fragile manual string concatenation for dynamic SQL clauses.
- Supports both JSON-object query definitions and fluent LINQ-style query building.
- Makes complex queries easier to compose from reusable pieces such as CTEs, subqueries, joins, and aggregate builders.
- Covers practical reporting and search scenarios with grouping, ordering, unions, window functions, row limiting, and Oracle-style clauses.
- Lets you write readable named placeholders such as `:entityId`, then converts them to SuiteQL positional `?` parameters with the matching `params` array.
- Lets the LINQ-style builder start from the same JSON query object shape used by `jsonToQueryProcessor.ts`, then continue chaining clauses.
- Produces plain SQL strings, so the output can be passed to NetSuite SuiteQL APIs, database adapters, logging tools, or tests.
- Provides minified and unminified JavaScript redistributions plus TypeScript declarations.

It is intentionally lightweight: it builds SQL strings from trusted field, table, and expression fragments that you provide. It does not try to validate your NetSuite schema or replace parameter binding in your execution layer.

## Installation

Install dependencies before building the redistributable files:

```bash
npm install
```

Build the JavaScript output:

```bash
npm run build
```

The build writes:

- `dist/jsonToQueryProcessor.js`: unminified ES module redistribution.
- `dist/jsonToQueryProcessor.min.js`: minified ES module redistribution.
- `dist/jsonToQueryProcessor.d.ts`: TypeScript declarations.
- `dist/suiteQLQueryBuilder.js`: unminified LINQ-style builder redistribution.
- `dist/suiteQLQueryBuilder.min.js`: minified LINQ-style builder redistribution.
- `dist/suiteQLQueryBuilder.d.ts`: builder TypeScript declarations.

## JSON Object Usage

```js
import { jsonToSuiteQL } from "./dist/jsonToQueryProcessor.js";

const suiteql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "T.trandate": { as: "transactionDate" },
    "BUILTIN.DF(T.status)": { as: "status" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    expression: "T.type = 'SalesOrd' AND T.entity = ?"
  },
  orderBy: ["T.trandate"]
});

console.log(suiteql);
```

Output:

```sql
SELECT T.id as id,T.trandate as transactionDate,BUILTIN.DF(T.status) as status FROM transaction as T WHERE T.type = 'SalesOrd' AND T.entity = ? ORDER BY T.trandate
```

## Named Parameters

SuiteQL execution uses positional `?` placeholders. For readability, this library can accept named placeholders and convert them into a positional query plus an ordered `params` array.

```js
import { jsonToSuiteQLWithParams } from "./dist/jsonToQueryProcessor.js";

const prepared = jsonToSuiteQLWithParams(
  {
    select: {
      "T.id": { as: "id" }
    },
    from: {
      transaction: { as: "T" }
    },
    where: {
      "T.entity": {
        operator: "=",
        value: { param: "entityId" },
        gate: "AND"
      },
      "T.type": {
        operator: "=",
        value: { param: "recordType" }
      }
    }
  },
  {
    entityId: 123,
    recordType: "SalesOrd"
  }
);

console.log(prepared.query);
console.log(prepared.params);
```

Output:

```js
{
  query: "SELECT T.id as id FROM transaction as T WHERE T.entity = ? AND T.type = ?",
  params: [123, "SalesOrd"],
  paramNames: ["entityId", "recordType"]
}
```

You can also convert a raw SQL string:

```js
import { prepareSuiteQL } from "./dist/jsonToQueryProcessor.js";

const prepared = prepareSuiteQL(
  "SELECT id FROM transaction WHERE entity = :entityId AND type = @recordType",
  {
    entityId: 123,
    recordType: "SalesOrd"
  }
);
```

## LINQ-Style Builder Usage

```js
import { oracleSQL, param, raw } from "./dist/suiteQLQueryBuilder.js";

const totals = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "total")
  .groupBy("T.entity")
  .havingRaw("SUM(T.foreigntotal) > 0");

const sql = oracleSQL()
  .withCte("entity_totals", totals)
  .from("transaction", "T")
  .innerJoin("entity", "E", "E.id = T.entity")
  .leftJoin("entity_totals", "ET", "ET.entity = T.entity")
  .select("T.id", "id")
  .select("E.altname", "entityName")
  .selectWindow(
    "SUM(T.foreigntotal)",
    {
      partitionBy: "T.entity",
      orderBy: "T.trandate",
      frame: "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
    },
    "runningTotal"
  )
  .where("T.entity", "=", param("entityId"))
  .where("T.foreigntotal", ">", raw("0"))
  .orderByColumn("T.trandate", "DESC", "NULLS LAST")
  .fetchFirst(10);

const prepared = sql.toParameterizedOracleSQL({
  entityId: 123
});
```

## API

### `jsonToSuiteQL(query)`

Accepts a query object and returns a SuiteQL string.

Supported top-level properties:

- `select`: fields, expressions, and select subqueries.
- `from`: tables, raw source expressions, joins, and source subqueries.
- `where`: a raw condition string or structured condition object.
- `with`: common table expressions.
- `distinct` / `all`: select modifiers.
- `having`: aggregate filters after `GROUP BY`.
- `window`: named window definitions.
- `offset`, `fetch`, `limit`: row limiting clauses.
- `groupBy`: SuiteQL fields, expressions, `ROLLUP`, `CUBE`, and grouping sets.
- `orderBy`: SuiteQL fields, expressions, directions, and `NULLS FIRST` / `NULLS LAST`.
- `union`: array of query objects or raw query strings joined by `UNION`.
- `unionAll`: array of query objects or raw query strings joined by `UNION ALL`.
- `intersect`, `minus`, `except`: additional read-only set operators.

### `prepareSuiteQL(query, params)` and `jsonToSuiteQLWithParams(query, params)`

Convert named placeholders to SuiteQL positional parameters.

- `:name` and `@name` are recognized outside quoted strings and SQL comments.
- Each named placeholder becomes `?`.
- Array values expand wherever the named placeholder appears, so `IN (:ids)` becomes `IN (?,?,?)` and `MY_FUNC(:values)` becomes `MY_FUNC(?,?,?)`.
- The returned `params` array follows the placeholder order in the final query string.
- Repeated names are repeated in the positional array.
- Empty arrays throw an error.
- Missing names throw an error.

Array examples:

```js
const prepared = prepareSuiteQL(
  "SELECT id FROM item WHERE id IN (:ids) AND itemtype = :itemType",
  {
    ids: [1, 2, 3, "id3"],
    itemType: "InvtPart"
  }
);
```

Output:

```js
{
  query: "SELECT id FROM item WHERE id IN (?,?,?,?) AND itemtype = ?",
  params: [1, 2, 3, "id3", "InvtPart"],
  paramNames: ["ids", "ids", "ids", "ids", "itemType"]
}
```

Arrays are not limited to `IN` clauses. The converter replaces the placeholder in place:

```js
const prepared = prepareSuiteQL(
  "SELECT CUSTOM_FUNC(:values) AS result FROM dual WHERE code BETWEEN :range",
  {
    values: [1, 2, 3],
    range: [10, 20]
  }
);
```

Output:

```js
{
  query: "SELECT CUSTOM_FUNC(?,?,?) AS result FROM dual WHERE code BETWEEN ?,?",
  params: [1, 2, 3, 10, 20],
  paramNames: ["values", "values", "values", "range", "range"]
}
```

### `suiteQL()` and `oracleSQL()`

Create a chainable query builder. `suiteQL()` keeps SuiteQL-style table aliases, while `oracleSQL()` renders Oracle-friendly table aliases without `AS`.

The builder supports common SQL query specification clauses:

- `WITH` CTEs.
- `SELECT`, `DISTINCT`, expressions, aliases, and select subqueries.
- `FROM`, raw sources, source subqueries, and multiple joins.
- `WHERE`, `EXISTS`, `IN`, `BETWEEN`, null checks, and raw predicates.
- `GROUP BY`, `HAVING`, `ROLLUP`, `CUBE`, and `GROUPING SETS`.
- Analytic/window functions with `OVER (...)`.
- `ORDER BY`, `OFFSET`, `FETCH FIRST/NEXT`, and `FOR UPDATE`.
- `UNION`, `UNION ALL`, `INTERSECT`, `MINUS`, and `EXCEPT`.
- Oracle hierarchical clauses: `START WITH` and `CONNECT BY`.

## Documentation

See [docs/HOW_TO.md](docs/HOW_TO.md) for detailed examples covering each supported query scenario.

For the chainable LINQ-style source version, including its syntax reference, Oracle SQL query specification support, CTEs, analytic/window functions, grouping, ordering, set operators, subqueries, and joins, see [docs/QUERY_BUILDER.md](docs/QUERY_BUILDER.md).

## Notes

This library assembles SuiteQL fragments that you provide. It does not validate table names, escape values, or bind parameters. Use `?` placeholders for values that should be bound by the NetSuite API or your database adapter.

SuiteQL is treated as read-only. The object processor rejects top-level DML or schema-changing keys such as `insert`, `update`, `delete`, `merge`, `create`, `alter`, `drop`, and `truncate`.
