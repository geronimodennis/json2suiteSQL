# LINQ-Style Query Builder

`suiteQLQueryBuilder.ts` is a chainable source version inspired by `jsonToQueryProcessor.ts`. It does not change the original processor. Use it when you want to build SuiteQL, Oracle SQL, or ANSI-style query specifications through fluent calls instead of one large JSON object.

## Import

```js
import {
  oracleSQL,
  suiteQL,
  suiteQLFromObject,
  param,
  raw
} from "../dist/suiteQLQueryBuilder.js";
```

Use `suiteQL()` for SuiteQL-style output and `oracleSQL()` for Oracle-friendly table aliases.

## Supported Clauses

The builder is intended to cover the common SQL query specification surface used by SuiteQL and Oracle SQL:

- `WITH` common table expressions.
- `SELECT`, `DISTINCT`, `ALL`, raw expressions, aliases, subqueries, and analytic/window expressions.
- `FROM`, table aliases, raw source fragments, source subqueries, and multiple joins.
- `WHERE`, `AND`, `OR`, `EXISTS`, `NOT EXISTS`, `IN`, `NOT IN`, `BETWEEN`, null checks, and raw predicates.
- `START WITH` and `CONNECT BY` for Oracle hierarchical queries.
- `GROUP BY`, `HAVING`, `ROLLUP`, `CUBE`, and `GROUPING SETS`.
- `WINDOW` and `OVER (...)` helpers for analytic functions.
- `ORDER BY`, `NULLS FIRST`, `NULLS LAST`, `OFFSET`, `FETCH FIRST/NEXT`, and `FOR UPDATE`.
- `UNION`, `UNION ALL`, `INTERSECT`, `INTERSECT ALL`, `MINUS`, `MINUS ALL`, `EXCEPT`, and `EXCEPT ALL`.

## LINQ-Style Syntax Reference

The builder is chainable: each method returns the same builder instance, so calls can be composed in SQL clause order.

```js
const sql = oracleSQL()
  .withCte("totals", totalsQuery)
  .from("transaction", "T")
  .leftJoin("entity", "E", "E.id = T.entity")
  .select("T.id", "id")
  .where("T.entity", "=", param())
  .groupBy("T.entity")
  .havingRaw("SUM(T.foreigntotal) > 0")
  .orderBy("T.trandate DESC")
  .fetchFirst(10)
  .toOracleSQL();
```

### Entry Points

| Method | Purpose |
| --- | --- |
| `suiteQL()` | Start a SuiteQL-style query builder. |
| `oracleSQL()` | Start an Oracle-style query builder. Table aliases render without `AS`. |
| `sql({ dialect })` | Start a builder with an explicit dialect: `suiteql`, `oracle`, or `ansi`. |
| `suiteQLFromObject(query)` | Convert a JSON-style query object into a chainable SuiteQL builder. |
| `oracleSQLFromObject(query)` | Convert a JSON-style query object into a chainable Oracle SQL builder. |
| `raw(value)` | Mark a value as a trusted SQL fragment. |
| `param()` | Render a `?` placeholder for external parameter binding. |
| `over(spec)` | Build an `OVER (...)` analytic/window clause fragment. |

### Select

| Method | Syntax | Output Intent |
| --- | --- | --- |
| `select(field, alias?)` | `.select("T.id", "id")` | Select one field with an optional alias. |
| `select(fields)` | `.select({ "T.id": "id", "T.tranid": "docNo" })` | Select multiple fields from an object map. |
| `selectAs(expression, alias)` | `.selectAs("T.id", "id")` | Alias an expression. |
| `selectRaw(expression, alias?)` | `.selectRaw("SUM(T.total)", "total")` | Add a raw select expression. |
| `selectSubquery(query, alias)` | `.selectSubquery(lineCount, "lineCount")` | Add a scalar subquery in the select list. |
| `selectWindow(expression, spec, alias?)` | `.selectWindow("SUM(T.total)", { partitionBy: "T.entity" }, "totalByEntity")` | Add an analytic/window expression. |
| `rowNumber(alias, spec?)` | `.rowNumber("rn", { orderBy: "T.id" })` | Add `ROW_NUMBER() OVER (...)`. |
| `rank(alias, spec?)` | `.rank("rankNo", { orderBy: "T.total DESC" })` | Add `RANK() OVER (...)`. |
| `denseRank(alias, spec?)` | `.denseRank("denseRankNo", { orderBy: "T.total DESC" })` | Add `DENSE_RANK() OVER (...)`. |
| `distinct()` / `selectDistinct()` | `.distinct()` | Render `SELECT DISTINCT`. |
| `selectAll()` | `.selectAll()` | Render `SELECT ALL`. |

### Sources and Joins

| Method | Syntax | Output Intent |
| --- | --- | --- |
| `from(source, alias?)` | `.from("transaction", "T")` | Add a table or source. |
| `fromRaw(expression)` | `.fromRaw("transaction T")` | Add a raw source fragment. |
| `fromSubquery(query, alias)` | `.fromSubquery(totals, "T")` | Add a subquery source. |
| `join(source, aliasOrOn?, on?)` | `.join("entity", "E", "E.id = T.entity")` | Add a generic join. |
| `leftJoin(source, aliasOrOn?, on?)` | `.leftJoin("entity", "E", "E.id = T.entity")` | Add a left join. |
| `rightJoin(source, aliasOrOn?, on?)` | `.rightJoin("entity", "E", "E.id = T.entity")` | Add a right join. |
| `innerJoin(source, aliasOrOn?, on?)` | `.innerJoin("currency", "C", "C.id = T.currency")` | Add an inner join. |
| `outerJoin(source, aliasOrOn?, on?)` | `.outerJoin("other_table", "O", "O.id = T.id")` | Add an outer join. |
| `fullJoin(source, aliasOrOn?, on?)` | `.fullJoin("budget", "B", "B.entity = T.entity")` | Add a full join. |
| `fullOuterJoin(source, aliasOrOn?, on?)` | `.fullOuterJoin("budget", "B", "B.entity = T.entity")` | Add a full outer join. |
| `crossJoin(source, aliasOrOn?, on?)` | `.crossJoin("calendar", "D")` | Add a cross join. |
| `joinAs(type, source, aliasOrOn?, on?)` | `.joinAs("LEFT OUTER JOIN", "entity", "E", "E.id = T.entity")` | Add a join with an explicit join type. |
| `joinRaw(expression)` | `.joinRaw("LEFT JOIN entity E ON E.id = T.entity")` | Add a raw join fragment. |

### Conditions

| Method | Syntax | Output Intent |
| --- | --- | --- |
| `where(field, operator, value?)` | `.where("T.entity", "=", param())` | Add an `AND` predicate. |
| `andWhere(field, operator, value?)` | `.andWhere("T.total", ">", raw("0"))` | Add another `AND` predicate. |
| `orWhere(field, operator, value?)` | `.orWhere("T.memo", "IS NOT", raw("NULL"))` | Add an `OR` predicate. |
| `whereRaw(expression)` | `.whereRaw("T.total > 0")` | Add a raw `AND` predicate. |
| `andWhereRaw(expression)` | `.andWhereRaw("T.status IS NOT NULL")` | Add another raw `AND` predicate. |
| `orWhereRaw(expression)` | `.orWhereRaw("T.memo IS NOT NULL")` | Add a raw `OR` predicate. |
| `whereIn(field, values)` | `.whereIn("T.entity", [1, 2, 3])` | Add an `IN (...)` predicate. |
| `orWhereIn(field, values)` | `.orWhereIn("T.entity", entityQuery)` | Add an `OR ... IN (subquery)` predicate. |
| `whereNotIn(field, values)` | `.whereNotIn("T.status", ["Closed"])` | Add a `NOT IN (...)` predicate. |
| `whereBetween(field, start, end)` | `.whereBetween("T.trandate", raw("DATE '2026-01-01'"), raw("DATE '2026-12-31'"))` | Add a `BETWEEN` predicate. |
| `whereNull(field)` | `.whereNull("T.memo")` | Add an `IS NULL` predicate. |
| `whereNotNull(field)` | `.whereNotNull("T.memo")` | Add an `IS NOT NULL` predicate. |
| `exists(query)` | `.exists(lineQuery)` | Add an `EXISTS (subquery)` predicate. |
| `orExists(query)` | `.orExists(lineQuery)` | Add an `OR EXISTS (subquery)` predicate. |
| `notExists(query)` | `.notExists(lineQuery)` | Add a `NOT EXISTS (subquery)` predicate. |
| `orNotExists(query)` | `.orNotExists(lineQuery)` | Add an `OR NOT EXISTS (subquery)` predicate. |

### CTEs, Grouping, Windows, and Ordering

| Method | Syntax | Output Intent |
| --- | --- | --- |
| `with(name, query, columns?)` | `.with("totals", totalsQuery)` | Add a CTE. |
| `withCte(name, query, columns?)` | `.withCte("totals", totalsQuery)` | Add a CTE with explicit naming. |
| `withRecursive(name, query, columns?)` | `.withRecursive("tree", treeQuery, ["id", "parent_id"])` | Add a recursive CTE marker. |
| `groupBy(...fields)` | `.groupBy("T.entity", "T.currency")` | Add normal grouping fields. |
| `rollup(...fields)` | `.rollup("T.entity", "T.currency")` | Add `GROUP BY ROLLUP (...)`. |
| `cube(...fields)` | `.cube("T.entity", "T.currency")` | Add `GROUP BY CUBE (...)`. |
| `groupingSets(...sets)` | `.groupingSets(["T.entity", "T.currency"], "T.entity")` | Add `GROUPING SETS (...)`. |
| `having(field, operator, value?)` | `.having("SUM(T.total)", ">", raw("0"))` | Add a `HAVING` predicate. |
| `andHaving(field, operator, value?)` | `.andHaving("COUNT(*)", ">", raw("1"))` | Add another `AND` having predicate. |
| `orHaving(field, operator, value?)` | `.orHaving("COUNT(*)", "=", raw("0"))` | Add an `OR` having predicate. |
| `havingRaw(expression)` | `.havingRaw("SUM(T.total) > 0")` | Add a raw having predicate. |
| `orHavingRaw(expression)` | `.orHavingRaw("COUNT(*) = 0")` | Add a raw `OR` having predicate. |
| `window(name, spec)` | `.window("by_entity", { partitionBy: "T.entity", orderBy: "T.date" })` | Add a named window clause. |
| `qualify(field, operator, value?)` | `.qualify("rn", "=", raw("1"))` | Add a `QUALIFY` predicate for dialects that support it. |
| `qualifyRaw(expression)` | `.qualifyRaw("rn = 1")` | Add a raw `QUALIFY` predicate. |
| `orQualifyRaw(expression)` | `.orQualifyRaw("rank_no <= 10")` | Add a raw `OR` qualify predicate. |
| `orderBy(...fields)` | `.orderBy("T.trandate DESC")` | Add order expressions. |
| `orderByColumn(field, direction?, nulls?)` | `.orderByColumn("T.trandate", "DESC", "NULLS LAST")` | Add a structured order expression. |

### Set Operators, Row Limiting, and Final Output

| Method | Syntax | Output Intent |
| --- | --- | --- |
| `union(...queries)` | `.union(customers, vendors)` | Combine queries with `UNION`. |
| `unionAll(...queries)` | `.unionAll(invoices, credits)` | Combine queries with `UNION ALL`. |
| `intersect(...queries)` | `.intersect(active, selected)` | Combine queries with `INTERSECT`. |
| `intersectAll(...queries)` | `.intersectAll(active, selected)` | Combine queries with `INTERSECT ALL`. |
| `minus(...queries)` | `.minus(blocked)` | Combine queries with Oracle `MINUS`. |
| `minusAll(...queries)` | `.minusAll(blocked)` | Combine queries with `MINUS ALL`. |
| `except(...queries)` | `.except(blocked)` | Combine queries with `EXCEPT`. |
| `exceptAll(...queries)` | `.exceptAll(blocked)` | Combine queries with `EXCEPT ALL`. |
| `setOperator(type, ...queries)` | `.setOperator("UNION ALL", invoices, credits)` | Use any supported set operator directly. |
| `offset(rows)` | `.offset(20)` | Add `OFFSET n ROWS`. |
| `fetchFirst(rows, options?)` | `.fetchFirst(10, { withTies: true })` | Add `FETCH FIRST/NEXT n ROWS ...`. |
| `limit(rows)` | `.limit(10)` | Alias for `fetchFirst(rows)`. |
| `forUpdate(options?)` | `.forUpdate("OF T.id")` | Add `FOR UPDATE`. |
| `startWith(expression)` | `.startWith("E.supervisor IS NULL")` | Add Oracle `START WITH`. |
| `connectBy(expression, nocycle?)` | `.connectBy("PRIOR E.id = E.supervisor")` | Add Oracle `CONNECT BY`. |
| `clone()` | `.clone()` | Copy the current builder. |
| `toSuiteQL()` | `.toSuiteQL()` | Render the final SQL string. |
| `toSQL()` | `.toSQL()` | Render the final SQL string. |
| `toOracleSQL()` | `.toOracleSQL()` | Render the final SQL string from an Oracle builder. |
| `toString()` | `.toString()` | Render the final SQL string implicitly. |

## Basic Query

```js
const sql = suiteQL()
  .from("transaction", "T")
  .select({
    "T.id": "id",
    "T.tranid": "documentNumber",
    "T.trandate": "transactionDate"
  })
  .where("T.type", "=", "SalesOrd")
  .orderBy("T.trandate DESC")
  .toSuiteQL();
```

```sql
SELECT T.id as id, T.tranid as documentNumber, T.trandate as transactionDate FROM transaction as T WHERE T.type = 'SalesOrd' ORDER BY T.trandate DESC
```

For Oracle SQL:

```js
const sql = oracleSQL()
  .from("transaction", "T")
  .select({
    "T.id": "id",
    "T.tranid": "documentNumber"
  })
  .where("T.type", "=", "SalesOrd")
  .toOracleSQL();
```

```sql
SELECT T.id as id, T.tranid as documentNumber FROM transaction T WHERE T.type = 'SalesOrd'
```

## Joins

```js
const sql = suiteQL()
  .from("transaction", "T")
  .leftJoin("entity", "E", "E.id = T.entity")
  .innerJoin("currency", "C", "C.id = T.currency")
  .select({
    "T.id": "id",
    "E.altname": "entityName",
    "C.symbol": "currency"
  })
  .toSuiteQL();
```

## Parameters and Raw SQL

String values passed to `where` are quoted and escaped. Use `param()` for a SuiteQL placeholder and `raw()` when the right-hand side is already a SuiteQL fragment.

```js
const sql = suiteQL()
  .from("transaction", "T")
  .select("T.id", "id")
  .where("T.entity", "=", param())
  .andWhere("T.foreigntotal", ">", raw("0"))
  .orWhereRaw("T.memo IS NOT NULL")
  .toSuiteQL();
```

```sql
SELECT T.id as id FROM transaction as T WHERE T.entity = ? AND T.foreigntotal > 0 OR T.memo IS NOT NULL
```

## Grouping and Ordering

```js
const sql = suiteQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "total")
  .groupBy("T.entity")
  .orderBy("total DESC")
  .toSuiteQL();
```

## HAVING, ROLLUP, CUBE, and GROUPING SETS

```js
const sql = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "total")
  .rollup("T.entity", "T.currency")
  .havingRaw("SUM(T.foreigntotal) > 0")
  .orderByColumn("total", "DESC", "NULLS LAST")
  .toOracleSQL();
```

```sql
SELECT T.entity as entity, SUM(T.foreigntotal) as total FROM transaction T GROUP BY ROLLUP (T.entity, T.currency) HAVING SUM(T.foreigntotal) > 0 ORDER BY total DESC NULLS LAST
```

```js
const sql = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .select("T.currency", "currency")
  .selectRaw("SUM(T.foreigntotal)", "total")
  .groupingSets(["T.entity", "T.currency"], "T.entity")
  .toOracleSQL();
```

## CTEs

Use `withCte` or `with` for common table expressions.

```js
const totals = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "total")
  .groupBy("T.entity");

const sql = oracleSQL()
  .withCte("entity_totals", totals)
  .from("entity_totals", "ET")
  .select("ET.entity", "entity")
  .select("ET.total", "total")
  .where("ET.total", ">", raw("0"))
  .toOracleSQL();
```

```sql
WITH entity_totals AS (SELECT T.entity as entity, SUM(T.foreigntotal) as total FROM transaction T GROUP BY T.entity) SELECT ET.entity as entity, ET.total as total FROM entity_totals ET WHERE ET.total > 0
```

## Multiple CTEs

Chain `withCte` calls when a query needs more than one common table expression.

```js
const salesTotals = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "salesTotal")
  .where("T.type", "=", "SalesOrd")
  .groupBy("T.entity");

const creditTotals = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .selectRaw("SUM(T.foreigntotal)", "creditTotal")
  .where("T.type", "=", "CustCred")
  .groupBy("T.entity");

const sql = oracleSQL()
  .withCte("sales_totals", salesTotals)
  .withCte("credit_totals", creditTotals)
  .from("sales_totals", "S")
  .leftJoin("credit_totals", "C", "C.entity = S.entity")
  .select("S.entity", "entity")
  .select("S.salesTotal", "salesTotal")
  .selectRaw("COALESCE(C.creditTotal, 0)", "creditTotal")
  .selectRaw("S.salesTotal - COALESCE(C.creditTotal, 0)", "netTotal")
  .orderBy("netTotal DESC")
  .toOracleSQL();
```

```sql
WITH sales_totals AS (SELECT T.entity as entity, SUM(T.foreigntotal) as salesTotal FROM transaction T WHERE T.type = 'SalesOrd' GROUP BY T.entity), credit_totals AS (SELECT T.entity as entity, SUM(T.foreigntotal) as creditTotal FROM transaction T WHERE T.type = 'CustCred' GROUP BY T.entity) SELECT S.entity as entity, S.salesTotal as salesTotal, COALESCE(C.creditTotal, 0) as creditTotal, S.salesTotal - COALESCE(C.creditTotal, 0) as netTotal FROM sales_totals S LEFT JOIN credit_totals C ON C.entity = S.entity ORDER BY netTotal DESC
```

## Window and Analytic Functions

Use `selectWindow`, `rowNumber`, `rank`, or `denseRank` for `OVER (...)` expressions.

```js
const sql = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .select("T.trandate", "transactionDate")
  .selectWindow(
    "SUM(T.foreigntotal)",
    {
      partitionBy: "T.entity",
      orderBy: "T.trandate",
      frame: "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
    },
    "runningTotal"
  )
  .rowNumber("rowNumber", {
    partitionBy: "T.entity",
    orderBy: "T.trandate DESC"
  })
  .toOracleSQL();
```

```sql
SELECT T.entity as entity, T.trandate as transactionDate, SUM(T.foreigntotal) OVER (PARTITION BY T.entity ORDER BY T.trandate ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as runningTotal, ROW_NUMBER() OVER (PARTITION BY T.entity ORDER BY T.trandate DESC) as rowNumber FROM transaction T
```

Named window clauses are also supported:

```js
const sql = suiteQL()
  .from("transaction", "T")
  .window("by_entity", {
    partitionBy: "T.entity",
    orderBy: "T.trandate"
  })
  .selectWindow("SUM(T.foreigntotal)", "by_entity", "runningTotal")
  .toSuiteQL();
```

## Subqueries

```js
const lineCount = suiteQL()
  .from("transactionline", "L")
  .selectRaw("COUNT(*)")
  .whereRaw("L.transaction = T.id");

const sql = suiteQL()
  .from("transaction", "T")
  .select("T.id", "id")
  .selectSubquery(lineCount, "lineCount")
  .toSuiteQL();
```

Subqueries can also be used in `FROM`, joins, and predicates:

```js
const highValueEntities = oracleSQL()
  .from("transaction", "T")
  .select("T.entity", "entity")
  .groupBy("T.entity")
  .havingRaw("SUM(T.foreigntotal) > 1000");

const sql = oracleSQL()
  .from("entity", "E")
  .whereIn("E.id", highValueEntities)
  .select("E.id", "entity")
  .select("E.altname", "name")
  .toOracleSQL();
```

## EXISTS

```js
const hasLines = suiteQL()
  .from("transactionline", "L")
  .selectRaw("1")
  .whereRaw("L.transaction = T.id");

const sql = suiteQL()
  .from("transaction", "T")
  .select("T.id", "id")
  .exists(hasLines)
  .toSuiteQL();
```

## UNION and UNION ALL

```js
const customers = suiteQL()
  .from("customer")
  .selectRaw("'customer'", "recordType")
  .select("id", "id");

const vendors = suiteQL()
  .from("vendor")
  .selectRaw("'vendor'", "recordType")
  .select("id", "id");

const sql = suiteQL()
  .union(customers, vendors)
  .toSuiteQL();
```

```sql
SELECT 'customer' as recordType, id as id FROM customer UNION SELECT 'vendor' as recordType, id as id FROM vendor
```

The builder also supports `INTERSECT`, `INTERSECT ALL`, `MINUS`, `MINUS ALL`, `EXCEPT`, and `EXCEPT ALL`.

```js
const activeCustomers = oracleSQL()
  .from("customer")
  .select("id", "id")
  .where("isinactive", "=", "F");

const blockedCustomers = oracleSQL()
  .from("customer")
  .select("id", "id")
  .where("custentity_blocked", "=", "T");

const sql = oracleSQL()
  .union(activeCustomers)
  .minus(blockedCustomers)
  .orderBy("id")
  .toOracleSQL();
```

## Row Limiting and Locking

```js
const sql = oracleSQL()
  .from("transaction", "T")
  .select("T.id", "id")
  .orderBy("T.trandate DESC")
  .offset(20)
  .fetchFirst(10)
  .forUpdate("OF T.id")
  .toOracleSQL();
```

```sql
SELECT T.id as id FROM transaction T ORDER BY T.trandate DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY FOR UPDATE OF T.id
```

## Oracle Hierarchical Clauses

```js
const sql = oracleSQL()
  .from("employee", "E")
  .select("E.id", "id")
  .select("E.supervisor", "supervisor")
  .startWith("E.supervisor IS NULL")
  .connectBy("PRIOR E.id = E.supervisor")
  .toOracleSQL();
```

## Start From an Existing Object

Use `suiteQLFromObject` to load the object shape used by `jsonToQueryProcessor.ts`, then continue chaining extra clauses.

```js
const sql = suiteQLFromObject({
  select: {
    "T.id": { as: "id" },
    "T.tranid": { as: "documentNumber" }
  },
  from: {
    transaction: { as: "T" }
  }
})
  .where("T.entity", "=", param())
  .orderBy("T.trandate DESC")
  .toSuiteQL();
```

## Build Output

Run:

```bash
npm run build
```

The builder redistributions are:

- `dist/suiteQLQueryBuilder.js`
- `dist/suiteQLQueryBuilder.min.js`
- `dist/suiteQLQueryBuilder.d.ts`
