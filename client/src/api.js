import axios from 'axios';

const request = axios.create({
  baseURL: '/api',
  timeout: 10000
});

let activeUserId = '';

export function setActiveUserId(userId) {
  activeUserId = userId || '';
}

request.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (activeUserId) config.headers['X-User-Id'] = activeUserId;
  return config;
});

request.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body.code !== 0) {
      return Promise.reject(new Error(body.message || '接口请求失败'));
    }
    return body.data;
  },
  (error) => {
    const message = error.response?.data?.message || error.message || '网络异常';
    return Promise.reject(new Error(message));
  }
);

export const receiptApi = {
  list(params) {
    return request.get('/receipts', { params });
  },
  single(params) {
    return request.get('/receipts/single', { params });
  },
  summary(params) {
    return request.get('/receipts/summary', { params });
  },
  trend(params) {
    return request.get('/receipts/trend', { params });
  },
  create(data) {
    return request.post('/receipts', data);
  },
  importRows(data) {
    return request.post('/receipts/import', data);
  },
  update(id, data) {
    return request.put(`/receipts/${id}`, data);
  },
  remove(id) {
    return request.delete(`/receipts/${id}`);
  }
};

export const userApi = {
  list() {
    return request.get('/users');
  },
  login(data) {
    return request.post('/users/login', data);
  },
  create(data) {
    return request.post('/users', data);
  }
};
