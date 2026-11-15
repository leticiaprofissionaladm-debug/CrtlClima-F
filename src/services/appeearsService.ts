import { api } from './api';

export type AppEEARSStatus = {
  configured: boolean;
  provider: string;
  message: string;
};

export type AppEEARSTaskInput = {
  name: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  product?: string;
  layer?: string;
};

export const getAppEEARSStatus = async () =>
  (await api.get<AppEEARSStatus>('/appeears/status')).data;

export const submitAppEEARSTask = async (input: AppEEARSTaskInput) =>
  (await api.post('/appeears/tasks', input)).data;

export const getAppEEARSTask = async (id: string) =>
  (await api.get(`/appeears/tasks/${encodeURIComponent(id)}`)).data;

export const getAppEEARSBundle = async (id: string) =>
  (await api.get(`/appeears/tasks/${encodeURIComponent(id)}/bundle`)).data;

export const getGiovanniTimeSeries = async (input: {
  data: string;
  latitude: number;
  longitude: number;
  start: string;
  end: string;
}) => (await api.get('/giovanni/timeseries', { params: input })).data;

export const getGiovanniVariables = async () =>
  (await api.get('/giovanni/variables')).data;

export const getSources = async () => (await api.get('/sources')).data;

export const downloadAppEEARSFile = async (taskId: string, fileId: string) =>
  (await api.get(
    `/appeears/tasks/${encodeURIComponent(taskId)}/bundle/${encodeURIComponent(fileId)}`,
    { responseType: 'blob', timeout: 120000 },
  )).data as Blob;
