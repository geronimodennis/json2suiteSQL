import test from 'node:test';
import assert from 'node:assert/strict';

import {
  jsonToSuiteQL,
  jsonToSuiteQLWithParams,
  prepareSuiteQL
} from '../dist/jsonToQueryProcessor.js';

test('jsonToSuiteQL renders the original object shape', () => {
  const sql = jsonToSuiteQL({
    select: {
      'T.id': {as: 'id'},
      'T.trandate': {as: 'transactionDate'},
      'BUILTIN.DF(T.status)': {as: 'status'}
    },
    from: {
      transaction: {as: 'T'},
      leftJoin: {
        entity: {as: 'E', on: 'E.id = T.entity'}
      }
    },
    where: {
      'T.type': {operator: '=', value: "'SalesOrd'", gate: 'AND'},
      'T.entity': {operator: '=', value: '?'}
    },
    orderBy: ['T.trandate']
  });

  assert.equal(
    sql,
    "SELECT T.id as id, T.trandate as transactionDate, BUILTIN.DF(T.status) as status FROM transaction as T LEFT JOIN entity as E ON E.id = T.entity WHERE T.type = 'SalesOrd' AND T.entity = ? ORDER BY T.trandate"
  );
});

test('jsonToSuiteQL supports advanced read-only clauses', () => {
  const totals = {
    select: {
      'T.entity': {as: 'entity'},
      expressionTotal: {expression: 'SUM(T.foreigntotal)', as: 'total'}
    },
    from: {transaction: {as: 'T'}},
    where: {'T.type': {operator: '=', value: "'SalesOrd'"}},
    groupBy: ['T.entity'],
    having: {expression: 'SUM(T.foreigntotal) > 0'}
  };

  const sql = jsonToSuiteQL({
    with: {entity_totals: totals},
    distinct: true,
    select: {
      'ET.entity': {as: 'entity'},
      'ET.total': {as: 'total'},
      expressionRank: {
        expression: 'RANK()',
        over: {orderBy: 'ET.total DESC'},
        as: 'rankNo'
      }
    },
    from: {entity_totals: {as: 'ET'}},
    orderBy: [{field: 'ET.total', direction: 'DESC', nulls: 'NULLS LAST'}],
    offset: 5,
    fetch: {rows: 10, withTies: true}
  });

  assert.equal(
    sql,
    "WITH entity_totals AS (SELECT T.entity as entity, SUM(T.foreigntotal) as total FROM transaction as T WHERE T.type = 'SalesOrd' GROUP BY T.entity HAVING SUM(T.foreigntotal) > 0) SELECT DISTINCT ET.entity as entity, ET.total as total, RANK() OVER (ORDER BY ET.total DESC) as rankNo FROM entity_totals as ET ORDER BY ET.total DESC NULLS LAST OFFSET 5 ROWS FETCH NEXT 10 ROWS WITH TIES"
  );
});

test('jsonToSuiteQLWithParams converts named params to positional params', () => {
  const prepared = jsonToSuiteQLWithParams(
    {
      select: {
        'T.id': {as: 'id'},
        'T.tranid': {as: 'documentNumber'}
      },
      from: {
        transaction: {as: 'T'}
      },
      where: {
        'T.entity': {operator: '=', value: {param: 'entityId'}, gate: 'AND'},
        'T.type': {operator: '=', value: {param: 'recordType'}}
      }
    },
    {
      entityId: 123,
      recordType: 'SalesOrd'
    }
  );

  assert.deepEqual(prepared, {
    query: 'SELECT T.id as id, T.tranid as documentNumber FROM transaction as T WHERE T.entity = ? AND T.type = ?',
    params: [123, 'SalesOrd'],
    paramNames: ['entityId', 'recordType']
  });
});

test('prepareSuiteQL expands array params wherever the placeholder appears', () => {
  const prepared = prepareSuiteQL(
    'SELECT CUSTOM_FUNC(:values) AS result FROM dual WHERE code BETWEEN :range AND id IN (:ids)',
    {
      values: [1, 2, 3],
      range: [10, 20],
      ids: [1, 2, 3, 'id3']
    }
  );

  assert.deepEqual(prepared, {
    query: 'SELECT CUSTOM_FUNC(?,?,?) AS result FROM dual WHERE code BETWEEN ?,? AND id IN (?,?,?,?)',
    params: [1, 2, 3, 10, 20, 1, 2, 3, 'id3'],
    paramNames: ['values', 'values', 'values', 'range', 'range', 'ids', 'ids', 'ids', 'ids']
  });
});

test('prepareSuiteQL ignores placeholders inside strings and comments', () => {
  const prepared = prepareSuiteQL(
    "SELECT ':literal' AS literal_value FROM transaction /* :blocked */ WHERE entity = :entityId -- :commented\nAND type = @recordType",
    {
      entityId: 123,
      recordType: 'SalesOrd'
    }
  );

  assert.deepEqual(prepared, {
    query: "SELECT ':literal' AS literal_value FROM transaction /* :blocked */ WHERE entity = ? -- :commented\nAND type = ?",
    params: [123, 'SalesOrd'],
    paramNames: ['entityId', 'recordType']
  });
});

test('prepareSuiteQL rejects missing and empty array named params', () => {
  assert.throws(
    () => prepareSuiteQL('SELECT id FROM transaction WHERE entity = :entityId', {}),
    /Missing value for named parameter :entityId/
  );

  assert.throws(
    () => prepareSuiteQL('SELECT id FROM item WHERE id IN (:ids)', {ids: []}),
    /Array parameter :ids cannot be empty/
  );
});

test('jsonToSuiteQL rejects SuiteQL write operations', () => {
  assert.throws(
    () => jsonToSuiteQL({delete: {from: 'transaction'}}),
    /SuiteQL is read-only/
  );
});
