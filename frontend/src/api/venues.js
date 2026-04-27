import { api } from './core';

export const venuesApi = {
  list: (params) => api.get('/venues', { params }),
  get: (id) => api.get(`/venues/${id}`),
  create: (data) => api.post('/venues', data),
  update: (id, d) => api.patch(`/venues/${id}`, d),
  summary: (id) => api.get(`/venues/${id}/summary`),
  eventHistory: (id) => api.get(`/venues/${id}/event-history`),
  addContact: (id, d) => api.post(`/venues/${id}/contacts`, d),
  addAccessRule: (id, d) => api.post(`/venues/${id}/access-rules`, d),
  addLoadingZone: (id, d) => api.post(`/venues/${id}/loading-zones`, d),
  addServiceArea: (id, d) => api.post(`/venues/${id}/service-areas`, d),
  addRoute: (id, d) => api.post(`/venues/${id}/routes`, d),
  addRestriction: (id, d) => api.post(`/venues/${id}/restrictions`, d),
  addParkingOption: (id, d) => api.post(`/venues/${id}/parking-options`, d),
  addConnectivityZone: (id, d) => api.post(`/venues/${id}/connectivity-zones`, d),
  addObservation: (id, d) => api.post(`/venues/${id}/observations`, d),
  updateSection: (id, section, rowId, d) => api.patch(`/venues/${id}/${section}/${rowId}`, d),
  deleteSection: (id, section, rowId) => api.delete(`/venues/${id}/${section}/${rowId}`),
  promoteObservation: (id, observationId, d) => api.post(`/venues/${id}/observations/${observationId}/promote`, d || {}),
};
