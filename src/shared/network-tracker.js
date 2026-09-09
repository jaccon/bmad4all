const { classifyResourceType, isApiRequest, extractApiOrigin } = require('./metrics-calculator.js');

class NetworkTracker {
  constructor(options = {}) {
    const opts = options || {};
    this.maxItems = opts.maxItems || 2000;
    this.requests = new Map();
    this.orderedIds = [];
    this.redirectCounts = new Map();
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      pendingRequests: 0,
      totalBytes: 0,
      typeCounts: {
        all: 0,
        api: 0,
        fetch: 0,
        script: 0,
        stylesheet: 0,
        image: 0,
        font: 0,
        document: 0,
        media: 0,
        other: 0
      }
    };
  }

  reset() {
    this.requests.clear();
    this.orderedIds = [];
    this.redirectCounts.clear();
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      pendingRequests: 0,
      totalBytes: 0,
      typeCounts: {
        all: 0,
        api: 0,
        fetch: 0,
        script: 0,
        stylesheet: 0,
        image: 0,
        font: 0,
        document: 0,
        media: 0,
        other: 0
      }
    };
  }

  onRequestWillBeSent(params) {
    if (!params || !params.request || !params.requestId) return null;

    let id = params.requestId;

    // Handle HTTP Redirects: If requestId exists and redirectResponse is provided, preserve original hop
    if (this.requests.has(id) && params.redirectResponse) {
      const prev = this.requests.get(id);
      prev.statusCode = params.redirectResponse.status || 302;
      prev.status = 'completed';

      const count = (this.redirectCounts.get(id) || 0) + 1;
      this.redirectCounts.set(id, count);
      id = `${params.requestId}#r${count}`;
    }

    const { request, type, timestamp, wallTime } = params;
    const category = classifyResourceType(type, '');
    const isApi = isApiRequest(request.url, type, '', request.method);
    const apiOrigin = extractApiOrigin(request.url);

    const record = {
      id,
      originalId: params.requestId,
      url: request.url || '',
      method: (request.method || 'GET').toUpperCase(),
      type: type || 'Other',
      category,
      isApi,
      apiOrigin,
      statusCode: null,
      statusText: '',
      mimeType: '',
      status: 'pending',
      startMonotonic: typeof timestamp === 'number' ? timestamp : 0,
      wallTime: typeof wallTime === 'number' ? wallTime : Date.now() / 1000,
      duration: 0,
      durationMs: 0,
      encodedDataLength: 0,
      dataLength: 0,
      timing: null,
      fromDiskCache: false,
      fromServiceWorker: false,
      remotePort: null,
      ttfbMs: 0,
      errorText: null,
      initiator: params.initiator ? params.initiator.type : null,
      requestHeaders: (request.headers && typeof request.headers === 'object' && !Array.isArray(request.headers)) ? { ...request.headers } : {},
      responseHeaders: {},
      protocol: '',
      remoteIPAddress: '',
      postData: request.postData || null
    };

    if (!this.requests.has(id)) {
      if (this.orderedIds.length >= this.maxItems) {
        const oldestId = this.orderedIds.shift();
        const oldItem = this.requests.get(oldestId);
        if (oldItem) {
          if (this.stats.typeCounts[oldItem.category] > 0) {
            this.stats.typeCounts[oldItem.category]--;
          }
          if (oldItem.isApi && this.stats.typeCounts.api > 0) {
            this.stats.typeCounts.api--;
          }
          this.stats.typeCounts.all--;
        }
        this.requests.delete(oldestId);
      }
      this.orderedIds.push(id);
      this.stats.totalRequests++;
      this.stats.pendingRequests = Math.max(0, this.stats.totalRequests - this.stats.completedRequests - this.stats.failedRequests);
      this.stats.typeCounts.all++;
      if (isApi) {
        this.stats.typeCounts.api++;
      }
      if (this.stats.typeCounts[category] !== undefined) {
        this.stats.typeCounts[category]++;
      } else {
        this.stats.typeCounts.other++;
      }
    }

    this.requests.set(id, record);
    return record;
  }

  onResponseReceived(params) {
    if (!params || !params.response || !params.requestId) return null;
    const { requestId, response, type, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    record.statusCode = response.status || 200;
    record.statusText = response.statusText || 'OK';
    record.mimeType = response.mimeType || '';
    if (response.headers && typeof response.headers === 'object' && !Array.isArray(response.headers)) {
      record.responseHeaders = { ...response.headers };
    }
    if (response.protocol) {
      record.protocol = response.protocol;
    }
    if (response.remoteIPAddress) {
      record.remoteIPAddress = response.remoteIPAddress;
    }
    if (response.remotePort) {
      record.remotePort = response.remotePort;
    }
    if (response.fromDiskCache) {
      record.fromDiskCache = true;
    }
    if (response.fromServiceWorker) {
      record.fromServiceWorker = true;
    }
    if (response.timing && typeof response.timing === 'object') {
      record.timing = { ...response.timing };
    }

    if (response.headers) {
      const cl = response.headers['content-length'] || response.headers['Content-Length'];
      if (cl) {
        const num = parseInt(cl, 10);
        if (!isNaN(num) && num > 0) {
          record.contentLength = num;
        }
      }
    }

    if (typeof response.encodedDataLength === 'number' && !isNaN(response.encodedDataLength) && response.encodedDataLength > 0) {
      const added = Math.max(0, response.encodedDataLength - record.encodedDataLength);
      record.encodedDataLength = response.encodedDataLength;
      this.stats.totalBytes += added;
    }

    // Re-evaluate category with mimeType
    const updatedCategory = classifyResourceType(type || record.type, response.mimeType);
    if (updatedCategory !== record.category) {
      if (this.stats.typeCounts[record.category] > 0) {
        this.stats.typeCounts[record.category]--;
      }
      record.category = updatedCategory;
      if (this.stats.typeCounts[updatedCategory] !== undefined) {
        this.stats.typeCounts[updatedCategory]++;
      } else {
        this.stats.typeCounts.other++;
      }
    }

    // Re-evaluate API classification with mimeType
    if (!record.isApi && isApiRequest(record.url, type || record.type, response.mimeType, record.method)) {
      record.isApi = true;
      this.stats.typeCounts.api++;
    }

    if (timestamp && record.startMonotonic > 0) {
      const d = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
      record.durationMs = d;
      record.duration = d;
      if (!record.ttfbMs) record.ttfbMs = d;
    }

    return record;
  }

  onDataReceived(params) {
    if (!params || !params.requestId) return null;
    const { requestId, dataLength, encodedDataLength, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    if (typeof dataLength === 'number' && !isNaN(dataLength) && dataLength > 0) {
      record.dataLength = (record.dataLength || 0) + dataLength;
    }

    const len = (typeof encodedDataLength === 'number' && !isNaN(encodedDataLength) && encodedDataLength > 0)
      ? encodedDataLength
      : ((typeof dataLength === 'number' && !isNaN(dataLength) && dataLength > 0) ? (record.encodedDataLength + dataLength) : 0);

    if (len > record.encodedDataLength) {
      const addedBytes = len - record.encodedDataLength;
      record.encodedDataLength = len;
      this.stats.totalBytes += addedBytes;
    }

    if (timestamp && record.startMonotonic > 0) {
      const d = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
      record.durationMs = d;
      record.duration = d;
    }

    return record;
  }

  onLoadingFinished(params) {
    if (!params || !params.requestId) return null;
    const { requestId, encodedDataLength, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    if (record.status !== 'completed') {
      if (record.status === 'failed') {
        this.stats.failedRequests = Math.max(0, this.stats.failedRequests - 1);
      }
      this.stats.completedRequests++;
      this.stats.pendingRequests = Math.max(0, this.stats.totalRequests - this.stats.completedRequests - this.stats.failedRequests);
    }
    record.status = 'completed';

    if (typeof encodedDataLength === 'number' && !isNaN(encodedDataLength) && encodedDataLength > 0) {
      const addedBytes = Math.max(0, encodedDataLength - record.encodedDataLength);
      record.encodedDataLength = encodedDataLength;
      this.stats.totalBytes += addedBytes;
    }

    if (timestamp && record.startMonotonic > 0) {
      const d = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
      record.durationMs = d;
      record.duration = d;
    }

    if (!record.dataLength) {
      record.dataLength = record.contentLength || record.encodedDataLength || 0;
    }

    return record;
  }

  onLoadingFailed(params) {
    if (!params || !params.requestId) return null;
    const { requestId, errorText, timestamp } = params;
    const record = this.requests.get(requestId);
    if (!record) return null;

    if (record.status !== 'failed') {
      if (record.status === 'completed') {
        this.stats.completedRequests = Math.max(0, this.stats.completedRequests - 1);
      }
      this.stats.failedRequests++;
      this.stats.pendingRequests = Math.max(0, this.stats.totalRequests - this.stats.completedRequests - this.stats.failedRequests);
    }
    record.status = 'failed';
    record.errorText = errorText || 'Failed';

    if (timestamp && record.startMonotonic > 0) {
      const d = Math.max(0, Math.round((timestamp - record.startMonotonic) * 1000));
      record.durationMs = d;
      record.duration = d;
    }

    return record;
  }

  getRequests() {
    return this.orderedIds.map(id => this.requests.get(id)).filter(Boolean);
  }

  getStats() {
    return {
      ...this.stats,
      pendingRequests: Math.max(0, this.stats.totalRequests - this.stats.completedRequests - this.stats.failedRequests)
    };
  }

  filter({ category = 'all', search = '', status = 'all', httpStatus = 'all', onlyApi = false, apiOrigin = '' } = {}) {
    const s = (search || '').toLowerCase().trim();
    const cat = (category || 'all').toLowerCase();
    const stat = (status || 'all').toLowerCase();
    const httpStat = String(httpStatus || 'all').toLowerCase().trim();

    return this.getRequests().filter(req => {
      if (!req) return false;
      if (onlyApi && !req.isApi) return false;
      if (apiOrigin && (!req.isApi || req.apiOrigin !== apiOrigin)) return false;
      if (cat !== 'all') {
        if (cat === 'api') {
          if (!req.isApi) return false;
        } else if (req.category !== cat) {
          return false;
        }
      }
      if (stat !== 'all' && req.status !== stat) return false;

      // HTTP Status filter
      if (httpStat !== 'all') {
        const code = Number(req.statusCode) || 0;
        if (httpStat === '2xx') {
          if (code < 200 || code >= 300) return false;
        } else if (httpStat === '3xx') {
          if (code < 300 || code >= 400) return false;
        } else if (httpStat === '4xx') {
          if (code < 400 || code >= 500) return false;
        } else if (httpStat === '5xx') {
          if (code < 500 || code >= 600) return false;
        } else if (httpStat === 'error') {
          const isError = (code >= 400) || (req.status === 'failed');
          if (!isError) return false;
        } else if (httpStat === 'pending') {
          if (req.status !== 'pending' && (code > 0 || req.status === 'failed')) return false;
        } else if (!isNaN(Number(httpStat))) {
          if (code !== Number(httpStat)) return false;
        }
      }

      // Search filter
      if (s) {
        // Special search syntax: status:... or status-code:...
        const statusPrefixMatch = s.match(/^status(?:-code)?:([a-z0-9]+)$/);
        if (statusPrefixMatch) {
          const targetStatus = statusPrefixMatch[1];
          const code = Number(req.statusCode) || 0;
          if (targetStatus === '2xx') {
            return code >= 200 && code < 300;
          } else if (targetStatus === '3xx') {
            return code >= 300 && code < 400;
          } else if (targetStatus === '4xx') {
            return code >= 400 && code < 500;
          } else if (targetStatus === '5xx') {
            return code >= 500 && code < 600;
          } else if (targetStatus === 'error') {
            return code >= 400 || req.status === 'failed';
          } else if (!isNaN(Number(targetStatus))) {
            return code === Number(targetStatus);
          }
          return false;
        }

        const reqUrl = (req.url || '').toLowerCase();
        const reqMethod = (req.method || '').toLowerCase();
        const reqStatusStr = String(req.statusCode || '');
        if (!reqUrl.includes(s) && !reqMethod.includes(s) && reqStatusStr !== s) {
          return false;
        }
      }
      return true;
    });
  }
}

module.exports = { NetworkTracker };
