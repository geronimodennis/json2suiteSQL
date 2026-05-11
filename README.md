# json2suiteSQL

Create SuiteQL strings from JSON-style query objects.

`json2suiteSQL` is a small TypeScript utility for building NetSuite SuiteQL statements in code without manually concatenating every clause. It supports `SELECT`, `FROM`, joins, `WHERE`, `GROUP BY`, `ORDER BY`, subqueries, `EXISTS`, `UNION`, and `UNION ALL`.

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

## Usage

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

## API

### `jsonToSuiteQL(query)`

Accepts a query object and returns a SuiteQL string.

Supported top-level properties:

- `select`: fields, expressions, and select subqueries.
- `from`: tables, raw source expressions, joins, and source subqueries.
- `where`: a raw condition string or structured condition object.
- `groupBy`: array of SuiteQL fields or expressions.
- `orderBy`: array of SuiteQL fields or expressions.
- `union`: array of query objects or raw query strings joined by `UNION`.
- `unionAll`: array of query objects or raw query strings joined by `UNION ALL`.

## Documentation

See [docs/HOW_TO.md](docs/HOW_TO.md) for detailed examples covering each supported query scenario.

## Notes

This library assembles SuiteQL fragments that you provide. It does not validate table names, escape values, or bind parameters. Use `?` placeholders for values that should be bound by the NetSuite API or your database adapter.
