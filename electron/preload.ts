import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getTasks: () => ipcRenderer.invoke('db:getTasks'),
  addTask: (task: any) => ipcRenderer.invoke('db:addTask', task),
  addTasks: (tasks: any[]) => ipcRenderer.invoke('db:addTasks', tasks),
  updateTask: (id: string, updates: any) => ipcRenderer.invoke('db:updateTask', id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke('db:deleteTask', id),
  getProjects: () => ipcRenderer.invoke('db:getProjects'),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('db:updateSettings', settings),
  getUserProfile: () => ipcRenderer.invoke('db:getUserProfile'),
  updateUserProfile: (profile: any) => ipcRenderer.invoke('db:updateUserProfile', profile),
  getUserStats: () => ipcRenderer.invoke('db:getUserStats'),
  getAuthData: () => ipcRenderer.invoke('db:getAuthData'),
  saveAuthData: (authData: any) => ipcRenderer.invoke('db:saveAuthData', authData),
  clearAuthData: () => ipcRenderer.invoke('db:clearAuthData'),
  generateAIWeeklyReport: (params: { apiKey?: string; baseUrl?: string; model?: string; tasks: any[]; userRole?: string }) =>
    ipcRenderer.invoke('ai:generateWeeklyReport', params),
  aiBreakdownTask: (params: { title: string; notes?: string; apiKey?: string; baseUrl?: string; model?: string; userRole?: string }) =>
    ipcRenderer.invoke('ai:breakdownTask', params),
  smartParseTasks: (params: { text: string; baseWeek?: 'current' | 'next'; defaultProjectId?: string; apiKey?: string; baseUrl?: string; model?: string; userRole?: string }) =>
    ipcRenderer.invoke('ai:smartParseTasks', params),
  testAIConnection: (params: { apiKey: string; baseUrl?: string; model?: string }) =>
    ipcRenderer.invoke('ai:testConnection', params),
  updateTrayTitle: (title: string) => ipcRenderer.send('tray:updateTitle', title),
  openDevTools: () => ipcRenderer.invoke('app:openDevTools'),
  onToggleCommandPalette: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on('action:toggleCommandPalette', subscription)
    return () => {
      ipcRenderer.removeListener('action:toggleCommandPalette', subscription)
    }
  },
})
