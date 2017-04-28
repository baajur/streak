class DyGraph {
  constructor(options) {
    this.options = options;
    this._pendingNodes = [];
    this._pendingEdges = [];
  }

  addNode(nodeId, data) {
    this._pendingNodes.push({
      id: nodeId,
      data
    });
  }

  removeEdge(fromId, toId) {
    this._pendingEdges.push({
      operation: 'remove',
      fromId,
      toId
    });
  }

  addEdge(fromId, toId, data) {
    this._pendingEdges.push({
      operation: 'update',
      fromId,
      toId,
      data
    });
  }

  getOutEdges(fromId, beginsWith) {
    const params = {
      TableName: this.options.edgesTable,
      KeyConditionExpression: 'FromId = :fromId',
      ExpressionAttributeValues: {
        ':fromId': fromId,
      }
    };

    if (beginsWith) {
      params.KeyConditionExpression += ' and begins_with(ToId, :beginsWith)';
      params.ExpressionAttributeValues[':beginsWith'] = beginsWith;
    }

    return new Promise((resolve, reject) => {
      this.options.dynamo.query(params).promise().then(resolve, reject);
    });
  }

  getInEdges(toId) {
    const params = {
      TableName: this.options.edgesTable,
      IndexName: 'ToId',
      KeyConditionExpression: 'ToId = :toId',
      ExpressionAttributeValues: {
        ':toId': toId,
      }
    };

    return new Promise((resolve, reject) => {
      this.options.dynamo.query(params).promise().then(resolve, reject);
    });
  }

  save() {
    const updates = this._pendingNodes.map(node => {
      return updateNode(this.options.dynamo, this.options.nodesTable, node);
    }).concat(this._pendingEdges.map(edge => {
      return edge.operation === 'update' ?
        updateEdge(this.options.dynamo, this.options.edgesTable, edge) :
        removeEdge(this.options.dynamo, this.options.edgesTable, edge);
    }));

    return Promise.all(updates);
  }
}

module.exports = DyGraph;

function updateNode(dynamo, table, node) {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: table,
      Key: { NodeId: node.id, },
      UpdateExpression: 'SET  createdTime = if_not_exists(createdTime, :createdTime)',
      ExpressionAttributeValues: {
        ':createdTime': (new Date()).toISOString(),
      }
    };

    if (node.data) {
      params.UpdateExpression += ', #data = :nodeData';
      params.ExpressionAttributeNames = { '#data': 'data' };
      params.ExpressionAttributeValues[':nodeData'] = node.data;
    }

    dynamo.update(params).promise().then(resolve, reject);
  });
}

function updateEdge(dynamo, table, edge) {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: table,
      Key: {
        FromId: edge.fromId,
        ToId: edge.toId
      },
      UpdateExpression: 'SET createdTime = if_not_exists(createdTime, :createdTime)',
      ExpressionAttributeValues: {
        ':createdTime': (new Date()).toISOString(),
      }
    };

    if (edge.data) {
      params.UpdateExpression += ', #data = :edgeData';
      params.ExpressionAttributeNames = { '#data': 'data' };
      params.ExpressionAttributeValues[':edgeData'] = edge.data;
    }

    dynamo.update(params).promise().then(resolve, reject);
  });
}

function removeEdge(dynamo, table, edge) {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: table,
      Key: {
        FromId: edge.fromId,
        ToId: edge.toId
      },
    };

    dynamo.delete(params).promise().then(resolve, reject);
  });
}
