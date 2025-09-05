/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  import * as React from 'react'
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module 'figma:asset/*' {
  const src: string
  export default src
}

// Declare sonner module with specific version
declare module 'sonner@2.0.3' {
  export { toast, Toaster } from 'sonner'
}

// HLS.js types
declare module 'hls.js' {
  export default class Hls {
    static isSupported(): boolean
    constructor(config?: any)
    loadSource(url: string): void
    attachMedia(video: HTMLVideoElement): void
    on(event: string, callback: Function): void
    destroy(): void
    recoverMediaError(): void
    startLoad(): void
    stopLoad(): void
  }
}