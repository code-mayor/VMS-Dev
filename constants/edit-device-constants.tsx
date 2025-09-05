import { Info, Network, Shield, Camera } from 'lucide-react'
import { TabConfig } from '../types/edit-device-types'

export const EDIT_DEVICE_TABS: TabConfig[] = [
  {
    id: 'general',
    label: 'General',
    icon: Info
  },
  {
    id: 'network',
    label: 'Network',
    icon: Network
  },
  {
    id: 'credentials',
    label: 'Credentials',
    icon: Shield
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Camera
  }
]

export const DEFAULT_FORM_DATA = {
  name: '',
  description: '',
  location: '',
  ip_address: '',
  port: 80,
  username: '',
  password: '',
  rtsp_username: '',
  rtsp_password: '',
  recording_enabled: false,
  motion_detection_enabled: false
}

export const FORM_VALIDATION = {
  name: {
    required: true,
    minLength: 1,
    maxLength: 100
  },
  ip_address: {
    required: true,
    pattern: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
  },
  port: {
    min: 1,
    max: 65535
  }
}