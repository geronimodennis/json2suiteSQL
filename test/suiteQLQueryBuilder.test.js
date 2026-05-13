import test from 'node:test';
import assert from 'node:assert/strict';

import {
  oracleSQL,
  oracleSQLFromObject,
  param,
  prepareSuiteQL,
  suiteQL,
  suiteQLFromObject
} from '../dist/suiteQLQueryBuilder.js';
import { jsonToSuiteQL } from '../dist/jsonToQueryProcessor.js';

test('suiteQL builder renders fluent SuiteQL', () => {
  const sql = suiteQL()
    .from('transaction', 'T')
    .leftJoin('entity', 'E', 'E.id = T.entity')
    .select({
      'T.id': 'id',
      'E.altname': 'entityName'
    })
    .where('T.type', '=', 'SalesOrd')
    .orderBy('T.trandate DESC')
    .toSuiteQL();

  assert.equal(
    sql,
    "SELECT T.id as id, E.altname as entityName FROM transaction as T LEFT JOIN entity as E ON E.id = T.entity WHERE T.type = 'SalesOrd' ORDER BY T.trandate DESC"
  );
});

test('oracleSQL builder supports named params with LINQ-style methods', () => {
  const prepared = oracleSQL()
    .from('transaction', 'T')
    .select('T.id', 'id')
    .where('T.entity', '=', param('entityId'))
    .andWhere('T.type', '=', param('recordType'))
    .toParameterizedOracleSQL({
      entityId: 123,
      recordType: 'SalesOrd'
    });

  assert.deepEqual(prepared, {
    query: 'SELECT T.id as id FROM transaction T WHERE T.entity = ? AND T.type = ?',
    params: [123, 'SalesOrd'],
    paramNames: ['entityId', 'recordType']
  });
});

test('oracleSQL builder expands array named params in fluent IN clauses', () => {
  const prepared = oracleSQL()
    .from('item', 'I')
    .select('I.id', 'id')
    .whereIn('I.id', param('ids'))
    .andWhere('I.itemtype', '=', param('itemType'))
    .toParameterizedOracleSQL({
      ids: [1, 2, 3, 'id3'],
      itemType: 'InvtPart'
    });

  assert.deepEqual(prepared, {
    query: 'SELECT I.id as id FROM item I WHERE I.id IN (?,?,?,?) AND I.itemtype = ?',
    params: [1, 2, 3, 'id3', 'InvtPart'],
    paramNames: ['ids', 'ids', 'ids', 'ids', 'itemType']
  });
});

test('oracleSQL builder expands array named params anywhere in raw SQL fragments', () => {
  const prepared = oracleSQL()
    .from('transaction', 'T')
    .selectRaw('CUSTOM_FUNC(:values)', 'result')
    .whereRaw('T.amount BETWEEN :range')
    .toParameterizedOracleSQL({
      values: [1, 2, 3],
      range: [10, 20]
    });

  assert.deepEqual(prepared, {
    query: 'SELECT CUSTOM_FUNC(?,?,?) as result FROM transaction T WHERE T.amount BETWEEN ?,?',
    params: [1, 2, 3, 10, 20],
    paramNames: ['values', 'values', 'values', 'range', 'range']
  });
});

test('suiteQLFromObject supports jsonToQueryProcessor object shape with named params', () => {
  const prepared = suiteQLFromObject({
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
  }).toParameterizedSuiteQL({
    entityId: 123,
    recordType: 'SalesOrd'
  });

  assert.deepEqual(prepared, {
    query: 'SELECT T.id as id, T.tranid as documentNumber FROM transaction as T WHERE T.entity = ? AND T.type = ?',
    params: [123, 'SalesOrd'],
    paramNames: ['entityId', 'recordType']
  });
});

test('suiteQLFromObject matches advanced jsonToQueryProcessor object clauses', () => {
  const query = {
    select: {
      'T.entity': {as: 'entity'},
      expressionRank: {
        expression: 'RANK()',
        over: {partitionBy: 'T.type', orderBy: 'SUM(T.foreigntotal) DESC'},
        as: 'rankNo'
      }
    },
    from: {
      transaction: {as: 'T'},
      leftJoin: {
        entity: {as: 'E', using: ['id']}
      }
    },
    where: {
      'T.type': {operator: 'IN', value: {param: 'types'}, gate: 'AND'},
      'T.status': {operator: '=', value: {expression: "'Open'"}}
    },
    startWith: {
      'T.parent': {operator: '=', value: 0}
    },
    connectBy: ['PRIOR T.id = T.parent'],
    groupBy: {
      expression: 'T.entity',
      rollup: ['T.type']
    },
    having: {
      'SUM(T.foreigntotal)': {op: 'BETWEEN', value: [10, 1000]}
    },
    orderBy: [{field: 'rankNo', direction: 'DESC', nulls: 'NULLS LAST'}],
    fetch: {rows: 5, withTies: true}
  };

  assert.equal(suiteQLFromObject(query).toSuiteQL(), jsonToSuiteQL(query));

  assert.deepEqual(suiteQLFromObject(query).toParameterizedSuiteQL({types: ['SalesOrd', 'CustInvc']}), {
    query:
      "SELECT T.entity as entity, RANK() OVER (PARTITION BY T.type ORDER BY SUM(T.foreigntotal) DESC) as rankNo FROM transaction as T LEFT JOIN entity as E USING (id) WHERE T.type IN (?,?) AND T.status = 'Open' START WITH T.parent = 0 CONNECT BY PRIOR T.id = T.parent GROUP BY T.entity, ROLLUP (T.type) HAVING SUM(T.foreigntotal) BETWEEN 10 AND 1000 ORDER BY rankNo DESC NULLS LAST FETCH FIRST 5 ROWS WITH TIES",
    params: ['SalesOrd', 'CustInvc'],
    paramNames: ['types', 'types']
  });
});

test('oracleSQLFromObject supports jsonToQueryProcessor IN param shorthand', () => {
  const prepared = oracleSQLFromObject({
    select: {
      id: {as: 'id'}
    },
    from: {
      item: {as: 'I'}
    },
    where: {
      id: {operator: 'IN', value: {param: 'ids'}}
    }
  }).toParameterizedOracleSQL({
    ids: [1, 2, 3, 'id3']
  });

  assert.deepEqual(prepared, {
    query: 'SELECT id as id FROM item I WHERE id IN (?,?,?,?)',
    params: [1, 2, 3, 'id3'],
    paramNames: ['ids', 'ids', 'ids', 'ids']
  });
});

test('builder prepareSuiteQL has the same named parameter semantics', () => {
  const prepared = prepareSuiteQL(
    "SELECT ':literal' AS literal_value FROM item WHERE id IN (:ids) AND itemtype = @itemType",
    {
      ids: [1, 2, 3, 'id3'],
      itemType: 'InvtPart'
    }
  );

  assert.deepEqual(prepared, {
    query: "SELECT ':literal' AS literal_value FROM item WHERE id IN (?,?,?,?) AND itemtype = ?",
    params: [1, 2, 3, 'id3', 'InvtPart'],
    paramNames: ['ids', 'ids', 'ids', 'ids', 'itemType']
  });
});

test('suiteQLFromObject rejects SuiteQL write operations', () => {
  assert.throws(
    () => suiteQLFromObject({update: {table: 'transaction'}}).toSuiteQL(),
    /SuiteQL is read-only/
  );
});
