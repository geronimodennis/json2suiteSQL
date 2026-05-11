export { jsonToSuiteQL };
function jsonToSuiteQL(jsonQuery = {}) {
    let queryString = [];
    let union = unionProcessor(jsonQuery.union);
    let unionAll = unionAllProcessor(jsonQuery.unionAll);
    let select = selectProcessor(jsonQuery.select);
    let from = fromProcessor(jsonQuery.from);
    let where = whereProcessor(jsonQuery.where);
    let groupBy = groupByProcessor(jsonQuery.groupBy);
    let orderBy = groupByProcessor(jsonQuery.orderBy);
    if (union) {
        queryString.push(union);
    }
    if (unionAll) {
        queryString.push(unionAll);
    }
    if (select) {
        queryString.push('SELECT');
        queryString.push(select);
    }
    if (from && from.trim()) {
        queryString.push('FROM');
        queryString.push(from);
    }
    if (where) {
        queryString.push('WHERE');
        queryString.push(where);
    }
    if (groupBy) {
        queryString.push('GROUP BY');
        queryString.push(groupBy);
    }
    if (orderBy) {
        queryString.push('ORDER BY');
        queryString.push(orderBy);
    }
    let finalQuery = '';
    //replace(/\s+/g, ' '); is to remove extra whitespaces in between strings
    // and replace it with single space ' '
    if (queryString.length)
        finalQuery = queryString.join(' ').replace(/\s+/g, ' ').trim();
    return finalQuery;
}
function selectProcessor(select) {
    if (!select || typeof select !== 'object')
        return '';
    let columnCollection = [];
    const buildColumn = (fieldName, relName, fieldInfo, isExpression = false) => {
        //if expression dont append the field name
        let selectCol = isExpression ? [] : [fieldName];
        if (typeof fieldInfo === 'object') {
            if (relName)
                selectCol[0] = relName;
            if (fieldInfo.as)
                selectCol.push('as ' + fieldInfo.as);
        }
        else {
            selectCol.push(fieldInfo);
        }
        return selectCol;
    };
    for (let fieldName in select) {
        let fieldInfo = select[fieldName];
        let key = fieldName.toUpperCase();
        let relName = util_IdentifyObjectRelName(fieldInfo);
        if (key.indexOf('EXPRESSION') === 0) {
            let selectCol = buildColumn(fieldName, relName, fieldInfo, true);
            columnCollection.push(selectCol.join(' '));
            //columnCollection.push(fieldInfo);
        }
        else if (key.indexOf('SUBQUERY') === 0) {
            let subQuery = [`(${jsonToSuiteQL(fieldInfo)})`];
            if (typeof fieldInfo === 'object' && fieldInfo.as) {
                subQuery.push('as ' + fieldInfo.as);
            }
            columnCollection.push(subQuery.join(' '));
        }
        else {
            let selectCol = buildColumn(fieldName, relName, fieldInfo);
            columnCollection.push(selectCol.join(' '));
        }
    }
    return columnCollection.join(',');
}
function fromProcessor(from) {
    if (!from || typeof from !== 'object')
        return '';
    let tableCollection = [];
    let tableJoinCollection = [];
    for (let tableName in from) {
        let tableInfo = from[tableName];
        let key = tableName.toUpperCase();
        if (key.indexOf('EXPRESSION') === 0) {
            tableCollection.push(tableInfo);
        }
        else if (key.indexOf('SUBQUERY') === 0) {
            let table = [];
            table.push('(' + jsonToSuiteQL(tableInfo) + ')');
            if (typeof tableInfo === 'object' && tableInfo.as) {
                table.push('as ' + tableInfo.as);
            }
            tableCollection.push(table.join(' '));
        }
        else if (key === 'JOIN' ||
            key === 'LEFTJOIN' ||
            key === 'RIGHTJOIN' ||
            key === 'INNERJOIN' ||
            key === 'OUTERJOIN' ||
            key === 'CROSSJOIN') {
            tableJoinCollection.push(...joinProcessor(key, tableInfo));
        }
        else {
            let table = [tableName];
            let relName = util_IdentifyObjectRelName(tableInfo);
            if (typeof tableInfo === 'object') {
                if (relName)
                    table[0] = relName;
                if (tableInfo.as)
                    table.push('as ' + tableInfo.as);
            }
            else {
                //a string value
                table.push(tableInfo);
            }
            tableCollection.push(table.join(' '));
        }
    }
    return tableCollection.join(', ') + ' ' + tableJoinCollection.join(' ');
}
function joinProcessor(joinType, join) {
    let tableCollection = [];
    for (let tableName in join) {
        let tableInfo = join[tableName];
        let key = tableName.toUpperCase();
        let joinTypeStr = 'LEFT JOIN';
        switch (joinType) {
            case 'JOIN':
                joinTypeStr = 'LEFT JOIN';
                break;
            case 'LEFTJOIN':
                joinTypeStr = 'LEFT JOIN';
                break;
            case 'RIGHTJOIN':
                joinTypeStr = 'RIGHT JOIN';
                break;
            case 'INNERJOIN':
                joinTypeStr = 'INNER JOIN';
                break;
            case 'OUTERJOIN':
                joinTypeStr = 'OUTER JOIN';
                break;
            case 'CROSSJOIN':
                joinTypeStr = 'CROSS JOIN';
                break;
        }
        if (key.indexOf('EXPRESSION') === 0) {
            if (typeof tableInfo === 'object') {
                let table = [joinTypeStr];
                if (tableInfo.table)
                    table.push(tableInfo.table);
                if (tableInfo.as)
                    table.push('as ' + tableInfo.as);
                if (tableInfo.on)
                    table.push('ON ' + tableInfo.on);
                tableCollection.push(table.join(' '));
            }
            else {
                tableCollection.push(tableInfo);
            }
        }
        else if (key.indexOf('SUBQUERY') === 0) {
            let table = [joinTypeStr, `(${jsonToSuiteQL(tableInfo)})`];
            if (tableInfo.as)
                table.push('as ' + tableInfo.as);
            if (tableInfo.on)
                table.push('ON ' + tableInfo.on);
            tableCollection.push(table.join(' '));
        }
        else {
            let table = [joinTypeStr];
            let tblName = util_IdentifyObjectRelName(tableInfo);
            if (tblName) {
                table.push(tblName);
            }
            else {
                table.push(tableName);
            }
            if (tableInfo.as)
                table.push('as ' + tableInfo.as);
            if (tableInfo.on)
                table.push('ON ' + tableInfo.on);
            tableCollection.push(table.join(' '));
        }
    }
    return tableCollection;
}
function whereProcessor(where) {
    if (!where)
        return '';
    let columnConditionCollection = [];
    let lastGate;
    if (typeof where === 'string')
        return `${where} `;
    let existParser = (fieldInfo, existClause = 'EXISTS') => {
        let columnExistConditionCollection = [];
        if (typeof fieldInfo === 'string') {
            fieldInfo = fieldInfo.trim();
            columnExistConditionCollection.push(`${existClause} ${fieldInfo}`);
        }
        else {
            columnExistConditionCollection.push(`${existClause}`);
            columnExistConditionCollection.push('(' + jsonToSuiteQL(fieldInfo) + ')');
            if (fieldInfo.gate) {
                columnExistConditionCollection.push(fieldInfo.gate);
            }
        }
        return columnExistConditionCollection.join(' ');
    };
    for (let fieldName in where) {
        lastGate = '';
        let fieldInfo = where[fieldName];
        let key = fieldName.toUpperCase();
        if (key.indexOf('EXPRESSION') === 0) {
            columnConditionCollection.push(fieldInfo);
        }
        else if (key.indexOf('SUBQUERY') === 0) {
            columnConditionCollection.push('(' + jsonToSuiteQL(fieldInfo) + ')');
        }
        else if (key.indexOf('EXISTS') === 0) {
            columnConditionCollection.push(existParser(fieldInfo));
        }
        else if (key.indexOf('NOTEXISTS') === 0) {
            columnConditionCollection.push(existParser(fieldInfo, 'NOT EXISTS'));
        }
        else {
            let relName = util_IdentifyObjectRelName(fieldInfo);
            let selectCol = [fieldName];
            if (relName)
                selectCol[0] = relName;
            if (fieldInfo.operator) {
                selectCol.push(fieldInfo.operator);
            }
            if (Object.prototype.hasOwnProperty.call(fieldInfo, 'value')) {
                selectCol.push(fieldInfo.value);
            }
            if (fieldInfo.gate) {
                selectCol.push(fieldInfo.gate);
                lastGate = fieldInfo.gate;
            }
            columnConditionCollection.push(selectCol.join(' '));
        }
    }
    /*const lastGateOnCondition = columnConditionCollection[columnConditionCollection.length-1]
    if(lastGate){
    }*/
    return columnConditionCollection.join(' ');
}
function groupByProcessor(groupBy) {
    if (!Array.isArray(groupBy))
        return '';
    return groupBy.join(', ');
}
function processUnionClause(union) {
    return union.map((unionElement) => {
        if (typeof unionElement === 'object') {
            return jsonToSuiteQL(unionElement).trim();
        }
        return unionElement;
    });
}
function unionProcessor(union) {
    if (!Array.isArray(union))
        return '';
    let unionList = processUnionClause(union);
    return unionList.join(' UNION ');
}
function unionAllProcessor(union) {
    if (!Array.isArray(union))
        return '';
    let unionList = processUnionClause(union);
    return unionList.join(' UNION ALL ');
}
/**
 *identify relative Name
 * order of priority name, table, field, expression, else if not any return ''
 */
function util_IdentifyObjectRelName(obj) {
    if (!obj || typeof obj !== 'object')
        return '';
    return obj.name || obj.table || obj.field || obj.expression || '';
}
