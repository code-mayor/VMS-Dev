import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Clock, RefreshCw } from 'lucide-react'

interface SessionWarningDialogProps {
  open: boolean
  onExtendSession: () => void
  onLogout: () => void
  onOpenChange: (open: boolean) => void
}

export function SessionWarningDialog({ 
  open, 
  onExtendSession, 
  onLogout, 
  onOpenChange 
}: SessionWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span>Session Expiring Soon</span>
          </DialogTitle>
          <DialogDescription>
            Your session will expire in 5 minutes due to inactivity. 
            Would you like to extend your session?
          </DialogDescription>
        </DialogHeader>
        <div className="flex space-x-2">
          <Button onClick={onExtendSession} className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4" />
            <span>Extend Session</span>
          </Button>
          <Button variant="outline" onClick={onLogout}>
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}