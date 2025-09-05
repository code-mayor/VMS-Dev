export interface Device {
  id: string
  name: string
  ip_address: string
  port: number
  manufacturer?: string
  model?: string
  username?: string
  password?: string
  rtsp_username?: string
  rtsp_password?: string
  location?: string
  description?: string
  authenticated: boolean
  status: string
  capabilities?: any
  recording_enabled?: boolean
  motion_detection_enabled?: boolean
}

export interface EditDeviceFormData {
  name: string
  description: string
  location: string
  ip_address: string
  port: number
  username: string
  password: string
  rtsp_username: string
  rtsp_password: string
  recording_enabled: boolean
  motion_detection_enabled: boolean
}

export interface EditDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: Device | null
  onDeviceUpdated: (device: Device) => void
}

export interface TabConfig {
  id: string
  label: string
  icon: React.ElementType
}