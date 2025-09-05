import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { 
  Shield, 
  Search, 
  Download, 
  Filter,
  User,
  Camera,
  Settings,
  AlertTriangle,
  Clock
} from 'lucide-react'

interface AuditLog {
  id: string
  user_id: string
  action: string
  resource: string
  resource_id: string
  details: any
  ip_address: string
  user_agent: string
  timestamp: string
}

interface AuditLogsProps {
  accessToken: string
}

export function AuditLogs({ accessToken }: AuditLogsProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [filterResource, setFilterResource] = useState('all')
  const [dateRange, setDateRange] = useState('7days')

  useEffect(() => {
    loadAuditLogs()
  }, [])

  useEffect(() => {
    filterLogs()
  }, [auditLogs, searchTerm, filterAction, filterResource, dateRange])

  const loadAuditLogs = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`https://${process.env.REACT_APP_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/make-server-097734f5/audit-logs`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      })

      const data = await response.json()
      
      if (data.success) {
        setAuditLogs(data.audit_logs)
      } else {
        setError(data.error || 'Failed to load audit logs')
      }
    } catch (error) {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const filterLogs = () => {
    let filtered = [...auditLogs]

    // Date range filter
    const now = new Date()
    const dateThreshold = new Date()
    switch (dateRange) {
      case '1day':
        dateThreshold.setDate(now.getDate() - 1)
        break
      case '7days':
        dateThreshold.setDate(now.getDate() - 7)
        break
      case '30days':
        dateThreshold.setDate(now.getDate() - 30)
        break
      case '90days':
        dateThreshold.setDate(now.getDate() - 90)
        break
      default:
        dateThreshold.setFullYear(2000) // Show all
    }

    filtered = filtered.filter(log => new Date(log.timestamp) >= dateThreshold)

    // Action filter
    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action.includes(filterAction))
    }

    // Resource filter
    if (filterResource !== 'all') {
      filtered = filtered.filter(log => log.resource === filterResource)
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(term) ||
        log.resource.toLowerCase().includes(term) ||
        log.ip_address.includes(term) ||
        JSON.stringify(log.details).toLowerCase().includes(term)
      )
    }

    setFilteredLogs(filtered)
  }

  const getActionIcon = (action: string) => {
    if (action.includes('login') || action.includes('signup')) {
      return <User className="w-4 h-4 text-blue-500" />
    }
    if (action.includes('device') || action.includes('ptz') || action.includes('recording')) {
      return <Camera className="w-4 h-4 text-green-500" />
    }
    if (action.includes('settings') || action.includes('user')) {
      return <Settings className="w-4 h-4 text-purple-500" />
    }
    return <Shield className="w-4 h-4 text-gray-500" />
  }

  const getActionBadge = (action: string) => {
    if (action.includes('delete') || action.includes('remove')) {
      return 'bg-red-100 text-red-800'
    }
    if (action.includes('create') || action.includes('add')) {
      return 'bg-green-100 text-green-800'
    }
    if (action.includes('update') || action.includes('modify')) {
      return 'bg-blue-100 text-blue-800'
    }
    if (action.includes('login') || action.includes('auth')) {
      return 'bg-purple-100 text-purple-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const getSeverityLevel = (action: string) => {
    const highRiskActions = ['delete', 'remove', 'password_reset', 'user_signup', 'admin']
    const mediumRiskActions = ['create', 'add', 'update', 'modify', 'login']
    
    if (highRiskActions.some(risk => action.includes(risk))) {
      return { level: 'High', color: 'text-red-600' }
    }
    if (mediumRiskActions.some(risk => action.includes(risk))) {
      return { level: 'Medium', color: 'text-yellow-600' }
    }
    return { level: 'Low', color: 'text-green-600' }
  }

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'User ID', 'Action', 'Resource', 'IP Address', 'Details'],
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.user_id,
        log.action,
        log.resource,
        log.ip_address,
        JSON.stringify(log.details)
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const uniqueActions = [...new Set(auditLogs.map(log => log.action.split('_')[0]))]
  const uniqueResources = [...new Set(auditLogs.map(log => log.resource))]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Security Audit Logs</span>
            </div>
            <Badge variant="outline">
              {filteredLogs.length} of {auditLogs.length} events
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map(action => (
                  <SelectItem key={action} value={action}>
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterResource} onValueChange={setFilterResource}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {uniqueResources.map(resource => (
                  <SelectItem key={resource} value={resource}>
                    {resource.charAt(0).toUpperCase() + resource.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1day">Last 24 hours</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">
                Showing {filteredLogs.length} events
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={exportLogs}
              disabled={filteredLogs.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Logs Table */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading audit logs...</p>
            </div>
          ) : filteredLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const severity = getSeverityLevel(log.action)
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="text-sm">
                              {new Date(log.timestamp).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getActionIcon(log.action)}
                          <Badge className={getActionBadge(log.action)}>
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {log.resource}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {log.user_id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {log.ip_address}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${severity.color}`}>
                          {severity.level}
                        </span>
                      </TableCell>
                      <TableCell>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600">
                            View Details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Audit Logs</h3>
              <p>No security events match your current filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}