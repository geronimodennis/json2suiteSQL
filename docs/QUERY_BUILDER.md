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
