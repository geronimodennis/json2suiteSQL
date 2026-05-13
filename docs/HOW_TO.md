# How to Use json2suiteSQL

This guide shows the supported query shapes and the SuiteQL they produce.

## Import

After running `npm run build`, import the unminified redistribution:

```js
import { jsonToSuiteQL } from "../dist/jsonToQueryProcessor.js";
```

Use the minified redistribution when you need a smaller browser or bundled artifact:

```js
import { jsonToSuiteQL } from "../dist/jsonToQueryProcessor.min.js";
```

## Core Rules

- Object keys become field names, table names, or special clause names.
- Keys that start with `expression` are emitted as raw SuiteQL fragments.
- Keys that start with `subquery` are converted into nested `SELECT` queries.
- `as` adds an alias.
- `name`, `table`, `field`, and `expression` override the object key that would normally be emitted.
- `where` values are not escaped. Quote literal values yourself or use `?` placeholders.
- When multiple structured `where` conditions are used, put `gate: "AND"` or `gate: "OR"` on the condition that comes before the next condition.
- Property order controls output order.

## Basic SELECT and FROM

```js
const sql = jsonToSuiteQL({
  select: {
    id: {},
    tranid: {}
  },
  from: {
    transaction: {}
  }
});
```

```sql
SELECT id,tranid FROM transaction
```

## Field Aliases

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "T.tranid": { as: "documentNumber" },
    "T.trandate": { as: "transactionDate" }
  },
  from: {
    transaction: { as: "T" }
  }
});
```

```sql
SELECT T.id as id,T.tranid as documentNumber,T.trandate as transactionDate FROM transaction as T
```

## SELECT Expressions

Use an `expression` key for raw SuiteQL select fragments.

```js
const sql = jsonToSuiteQL({
  select: {
    expressionTotal: {
      expression: "SUM(T.foreigntotal)",
      as: "total"
    },
    expressionStatus: {
      expression: "BUILTIN.DF(T.status)",
      as: "status"
    }
  },
  from: {
    transaction: { as: "T" }
  }
});
```

```sql
SELECT SUM(T.foreigntotal) as total,BUILTIN.DF(T.status) as status FROM transaction as T
```

## Override a Field Name

`field`, `name`, `table`, and `expression` can replace the object key.

```js
const sql = jsonToSuiteQL({
  select: {
    displayStatus: {
      field: "BUILTIN.DF(T.status)",
      as: "status"
    }
  },
  from: {
    transaction: { as: "T" }
  }
});
```

```sql
SELECT BUILTIN.DF(T.status) as status FROM transaction as T
```

## Multiple FROM Tables

Multiple normal `from` entries are comma-separated.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "transactionId" },
    "E.id": { as: "entityId" }
  },
  from: {
    transaction: { as: "T" },
    entity: { as: "E" }
  }
});
```

```sql
SELECT T.id as transactionId,E.id as entityId FROM transaction as T, entity as E
```

## Raw FROM Expressions

Use this when the source clause should be emitted exactly as provided.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    expression: "transaction T"
  }
});
```

```sql
SELECT T.id as id FROM transaction T
```

## Joins

Supported join keys are `join`, `leftJoin`, `rightJoin`, `innerJoin`, `outerJoin`, and `crossJoin`.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "E.altname": { as: "entityName" },
    "C.symbol": { as: "currency" }
  },
  from: {
    transaction: { as: "T" },
    leftJoin: {
      entity: { as: "E", on: "E.id = T.entity" }
    },
    innerJoin: {
      currency: { as: "C", on: "C.id = T.currency" }
    }
  }
});
```

```sql
SELECT T.id as id,E.altname as entityName,C.symbol as currency FROM transaction as T LEFT JOIN entity as E ON E.id = T.entity INNER JOIN currency as C ON C.id = T.currency
```

`join` is treated as `LEFT JOIN`.

## Raw Join Expressions

Use an `expression` key inside a join block for complete control.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "E.altname": { as: "entityName" }
  },
  from: {
    transaction: { as: "T" },
    leftJoin: {
      expressionEntity: "LEFT JOIN entity E ON E.id = T.entity"
    }
  }
});
```

```sql
SELECT T.id as id,E.altname as entityName FROM transaction as T LEFT JOIN entity E ON E.id = T.entity
```

## WHERE as a Raw String

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: "T.type = 'SalesOrd' AND T.entity = ?"
});
```

```sql
SELECT T.id as id FROM transaction as T WHERE T.type = 'SalesOrd' AND T.entity = ?
```

## Structured WHERE Conditions

Use `operator`, `value`, and `gate`.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    "T.type": {
      operator: "=",
      value: "'SalesOrd'",
      gate: "AND"
    },
    "T.entity": {
      operator: "=",
      value: "?"
    }
  }
});
```

```sql
SELECT T.id as id FROM transaction as T WHERE T.type = 'SalesOrd' AND T.entity = ?
```

## WHERE Expressions

Use an `expression` key when the condition is easier to write as a full SuiteQL fragment.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    expression: "(T.foreigntotal > 0 OR T.foreigntotal IS NULL)"
  }
});
```

```sql
SELECT T.id as id FROM transaction as T WHERE (T.foreigntotal > 0 OR T.foreigntotal IS NULL)
```

## EXISTS and NOT EXISTS

`exists` and `notExists` can receive a raw string or a nested query object.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    existsLines: {
      select: {
        expressionOne: {
          expression: "1"
        }
      },
      from: {
        transactionline: { as: "L" }
      },
      where: {
        expression: "L.transaction = T.id"
      }
    }
  }
});
```

```sql
SELECT T.id as id FROM transaction as T WHERE EXISTS (SELECT 1 FROM transactionline as L WHERE L.transaction = T.id)
```

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    notExistsClosedLines: `(
      SELECT 1
      FROM transactionline L
      WHERE L.transaction = T.id AND L.isclosed = 'T'
    )`
  }
});
```

```sql
SELECT T.id as id FROM transaction as T WHERE NOT EXISTS ( SELECT 1 FROM transactionline L WHERE L.transaction = T.id AND L.isclosed = 'T' )
```

## GROUP BY

```js
const sql = jsonToSuiteQL({
  select: {
    "T.entity": { as: "entity" },
    expressionTotal: {
      expression: "SUM(T.foreigntotal)",
      as: "total"
    }
  },
  from: {
    transaction: { as: "T" }
  },
  groupBy: ["T.entity"]
});
```

```sql
SELECT T.entity as entity,SUM(T.foreigntotal) as total FROM transaction as T GROUP BY T.entity
```

## ORDER BY

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "T.trandate": { as: "transactionDate" }
  },
  from: {
    transaction: { as: "T" }
  },
  orderBy: ["T.trandate DESC", "T.id"]
});
```

```sql
SELECT T.id as id,T.trandate as transactionDate FROM transaction as T ORDER BY T.trandate DESC, T.id
```

## SELECT Subqueries

Use a key that starts with `subquery` inside `select`.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    subqueryLineCount: {
      select: {
        expressionCount: {
          expression: "COUNT(*)"
        }
      },
      from: {
        transactionline: { as: "L" }
      },
      where: {
        expression: "L.transaction = T.id"
      },
      as: "lineCount"
    }
  },
  from: {
    transaction: { as: "T" }
  }
});
```

```sql
SELECT T.id as id,(SELECT COUNT(*) FROM transactionline as L WHERE L.transaction = T.id) as lineCount FROM transaction as T
```

## FROM Subqueries

Use a key that starts with `subquery` inside `from`.

```js
const sql = jsonToSuiteQL({
  select: {
    "Totals.entity": { as: "entity" },
    "Totals.total": { as: "total" }
  },
  from: {
    subqueryTotals: {
      select: {
        "T.entity": { as: "entity" },
        expressionTotal: {
          expression: "SUM(T.foreigntotal)",
          as: "total"
        }
      },
      from: {
        transaction: { as: "T" }
      },
      groupBy: ["T.entity"],
      as: "Totals"
    }
  }
});
```

```sql
SELECT Totals.entity as entity,Totals.total as total FROM (SELECT T.entity as entity,SUM(T.foreigntotal) as total FROM transaction as T GROUP BY T.entity) as Totals
```

## Join Subqueries

Use a key that starts with `subquery` inside any join block.

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "LineTotals.total": { as: "lineTotal" }
  },
  from: {
    transaction: { as: "T" },
    leftJoin: {
      subqueryLineTotals: {
        select: {
          "L.transaction": { as: "transaction" },
          expressionTotal: {
            expression: "SUM(L.netamount)",
            as: "total"
          }
        },
        from: {
          transactionline: { as: "L" }
        },
        groupBy: ["L.transaction"],
        as: "LineTotals",
        on: "LineTotals.transaction = T.id"
      }
    }
  }
});
```

```sql
SELECT T.id as id,LineTotals.total as lineTotal FROM transaction as T LEFT JOIN (SELECT L.transaction as transaction,SUM(L.netamount) as total FROM transactionline as L GROUP BY L.transaction) as LineTotals ON LineTotals.transaction = T.id
```

## UNION

Use `union` for query objects or raw query strings joined by `UNION`.

```js
const sql = jsonToSuiteQL({
  union: [
    {
      select: {
        "'customer'": { as: "recordType" },
        id: { as: "id" }
      },
      from: {
        customer: {}
      }
    },
    {
      select: {
        "'vendor'": { as: "recordType" },
        id: { as: "id" }
      },
      from: {
        vendor: {}
      }
    }
  ]
});
```

```sql
SELECT 'customer' as recordType,id as id FROM customer UNION SELECT 'vendor' as recordType,id as id FROM vendor
```

## UNION ALL

Use `unionAll` when duplicates should be preserved.

```js
const sql = jsonToSuiteQL({
  unionAll: [
    "SELECT id, tranid FROM transaction WHERE type = 'CustInvc'",
    "SELECT id, tranid FROM transaction WHERE type = 'CustCred'"
  ]
});
```

```sql
SELECT id, tranid FROM transaction WHERE type = 'CustInvc' UNION ALL SELECT id, tranid FROM transaction WHERE type = 'CustCred'
```

## Advanced Read-Only Clauses

The object processor supports additional SELECT-only clauses for SuiteQL and Oracle-style query specifications. It intentionally does not support insert, update, delete, merge, or schema-changing statements.

```js
const totals = {
  select: {
    "T.entity": { as: "entity" },
    expressionTotal: {
      expression: "SUM(T.foreigntotal)",
      as: "total"
    }
  },
  from: {
    transaction: { as: "T" }
  },
  where: {
    "T.type": {
      operator: "=",
      value: "'SalesOrd'"
    }
  },
  groupBy: ["T.entity"],
  having: {
    expression: "SUM(T.foreigntotal) > 0"
  }
};

const sql = jsonToSuiteQL({
  with: {
    entity_totals: totals
  },
  distinct: true,
  select: {
    "ET.entity": { as: "entity" },
    "ET.total": { as: "total" },
    expressionRank: {
      expression: "RANK()",
      over: {
        orderBy: "ET.total DESC"
      },
      as: "rankNo"
    }
  },
  from: {
    entity_totals: { as: "ET" }
  },
  orderBy: [
    {
      field: "ET.total",
      direction: "DESC",
      nulls: "NULLS LAST"
    }
  ],
  offset: 5,
  fetch: {
    rows: 10,
    withTies: true
  }
});
```

```sql
WITH entity_totals AS (SELECT T.entity as entity, SUM(T.foreigntotal) as total FROM transaction as T WHERE T.type = 'SalesOrd' GROUP BY T.entity HAVING SUM(T.foreigntotal) > 0) SELECT DISTINCT ET.entity as entity, ET.total as total, RANK() OVER (ORDER BY ET.total DESC) as rankNo FROM entity_totals as ET ORDER BY ET.total DESC NULLS LAST OFFSET 5 ROWS FETCH NEXT 10 ROWS WITH TIES
```

Additional supported read-only set operators include `intersect`, `intersectAll`, `minus`, `minusAll`, `except`, and `exceptAll`.

## Full Transaction Example

```js
const sql = jsonToSuiteQL({
  select: {
    "T.id": { as: "id" },
    "T.type": { as: "type" },
    "T.trandate": { as: "tranDate" },
    "TO_NCHAR(T.number)": { as: "documentNumber" },
    "TO_NCHAR(T.entity)": { as: "entity" },
    "E.altname": { as: "entityDisplay" },
    "T.foreigntotal": { as: "total" },
    "C.symbol": { as: "currency" },
    "BUILTIN.DF(T.status)": { as: "status" },
    "T.duedate": { as: "dueDate" },
    "BUILTIN.DF(LINE.projecttask)": { as: "projectTask" }
  },
  from: {
    transaction: { as: "T" },
    leftJoin: {
      currency: { as: "C", on: "C.id = T.currency" },
      entity: { as: "E", on: "E.id = T.entity" },
      transactionline: { as: "LINE", on: "LINE.transaction = T.id" }
    }
  },
  where: {
    expression: "T.type = 'PurchOrd' AND LINE.entity = ?"
  },
  groupBy: [
    "T.id",
    "T.type",
    "T.trandate",
    "T.number",
    "T.entity",
    "E.altname",
    "T.foreigntotal",
    "C.symbol",
    "BUILTIN.DF(T.status)",
    "T.duedate",
    "BUILTIN.DF(LINE.projecttask)"
  ],
  orderBy: ["T.trandate"]
});
```

## Redistribution

Run:

```bash
npm run build
```

Commit both generated files when you want to redistribute the library without requiring consumers to compile TypeScript:

- `dist/jsonToQueryProcessor.js`
- `dist/jsonToQueryProcessor.min.js`

The unminified file is useful for debugging and readable distribution. The minified file is useful for compact redistribution in bundles or browser-facing packages.
