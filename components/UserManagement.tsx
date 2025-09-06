import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Crown,
  Eye,
  Edit,
  Trash2,
  Search,
  Filter,
  MoreVertical,
  Calendar,
  Clock,
  AlertCircle,
  RefreshCw,
  WifiOff
} from 'lucide-react'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'operator' | 'viewer'
  active: boolean
  created_at: string
  last_login?: string
  failed_login_attempts: number
  locked_until?: string
}

// Tries all places the token might be stored and returns a string or null
function getToken(): string | null {
  const direct = localStorage.getItem('vms_token');
  if (direct) return direct;

  const access = localStorage.getItem('accessToken');
  if (access) return access;

  try {
    const blob = JSON.parse(localStorage.getItem('auth') || '{}');
    if (blob?.accessToken) return blob.accessToken;
  } catch { }
  return null;
}


interface UserManagementProps {
  currentUser: any
  hasPermission: (resource: string, action: string) => boolean
  onTokenExpired?: () => void  // Optional callback to parent component
}

export function UserManagement({ currentUser, hasPermission, onTokenExpired }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer' as const,
    active: true
  })

  useEffect(() => {
    const token = getToken();
    const mode = localStorage.getItem('vms_session_mode') || 'online';
    const isDemo = mode === 'demo' || (token || '').startsWith('demo_token_');

    if (isDemo) {
      setError('Demo mode: User Management requires a server login.');
      setLoading(false);
      return;
    }

    if (!token) {
      // Show the banner but try once shortly (in case token is written just after mount)
      setError('Please log in to view users');
      setLoading(false);
      const t = setTimeout(() => {
        const tkn = getToken();
        if (tkn) {
          setError('');
          setLoading(true);
          loadUsers();
        }
      }, 600);
      return () => clearTimeout(t);
    }

    // We have a token → load
    loadUsers();
  }, []);

  const checkAndRefreshToken = async () => {
    try {
      const token = localStorage.getItem('vms_token')
      if (!token) return false

      // First check if token is still valid
      const statusResponse = await fetch('http://localhost:3001/api/auth/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (statusResponse.ok) {
        // Token is still valid
        return true
      }

      // Token is invalid, try to refresh using stored credentials if available
      const storedUser = localStorage.getItem('vms_user')
      if (storedUser) {
        const userData = JSON.parse(storedUser)

        // If you have a refresh endpoint, use it here
        // Otherwise, notify parent component to handle re-authentication
        if (onTokenExpired) {
          onTokenExpired()
        }
        return false
      }

      return false
    } catch (error) {
      console.error('Error checking token:', error)
      return false
    }
  }

  // Always send Authorization and handle 401 once
  async function authFetch(url: string, init: RequestInit = {}) {
    const token = localStorage.getItem('vms_token')
    const mode = localStorage.getItem('vms_session_mode') || 'online'

    if (!token) throw new Error('Not authenticated')

    // Do not hit server at all in demo/offline mode
    if (mode === 'demo' || token.startsWith('demo_token_')) {
      throw new Error('Offline/demo mode: server routes are disabled')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> || {}),
      Authorization: `Bearer ${token}`
    }

    const res = await fetch(url, { ...init, headers })

    if (res.status === 401) {
      // clear session and bubble up
      localStorage.removeItem('vms_token')
      localStorage.removeItem('vms_user')
      localStorage.removeItem('vms_session_expiry')
      localStorage.removeItem('vms_session_mode')
      throw new Error('Session expired. Please log in again.')
    }

    return res
  }

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError('')

      const token = localStorage.getItem('vms_token')

      if (!token) {
        console.error('No authentication token found')
        setError('Please log in to view users')
        setLoading(false)
        return
      }

      console.log('Loading users...')

      const response = await authFetch('http://localhost:3001/api/auth/users', {
        method: 'GET'
      })

      console.log('Users API response status:', response.status)

      // Handle authentication errors
      if (response.status === 401) {
        // Try to refresh token once
        const tokenValid = await checkAndRefreshToken()
        if (!tokenValid) {
          setError('Your session has expired. Please refresh the page and log in again.')
          setLoading(false)
          return
        }

        // Retry with potentially refreshed token
        if (retryCount < 1) {
          setRetryCount(prev => prev + 1)
          loadUsers()
          return
        }

        setError('Authentication failed. Please refresh the page.')
        setLoading(false)
        return
      }

      if (response.status === 403) {
        setError('You do not have permission to view users.')
        setLoading(false)
        return
      }

      // Try to parse response
      let data
      try {
        data = await response.json()
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        throw new Error('Invalid response from server')
      }

      console.log('Response data:', data)

      // Check if we got valid data
      if (data && data.users) {
        setUsers(data.users)
        setRetryCount(0)
        setError('')  // Clear any previous errors
      } else if (data && data.error) {
        throw new Error(data.error)
      } else {
        throw new Error('No users data received')
      }

    } catch (err: any) {
      console.error('Error loading users:', err)

      // Check if it's a network error
      if (err.message && err.message.includes('fetch')) {
        setError('Network error. Please check your connection.')

        // Auto-retry for network errors
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1)
            loadUsers()
          }, 2000)
        }
      } else {
        setError(err.message || 'Failed to load users')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hasPermission('users', 'create')) {
      setError('You do not have permission to create users')
      return
    }

    try {
      setError('')
      const token = localStorage.getItem('vms_token')

      if (!token) {
        setError('Not authenticated. Please log in again.')
        return
      }

      console.log('Creating user:', formData.email)

      const response = await authFetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData)
      })

      console.log('Create user response status:', response.status)

      if (response.status === 401) {
        const tokenValid = await checkAndRefreshToken()
        if (!tokenValid) {
          setError('Session expired. Please refresh the page and log in again.')
          return
        }
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      console.log('User created:', data)

      // Clear form and reload users
      setShowAddDialog(false)
      setFormData({ name: '', email: '', password: '', role: 'viewer', active: true })
      setError('')  // Clear any errors
      await loadUsers()

    } catch (err: any) {
      console.error('Error creating user:', err)
      setError(err.message || 'Failed to create user')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!hasPermission('users', 'delete')) {
      setError('You do not have permission to delete users')
      return
    }

    if (userId === currentUser?.id) {
      setError('You cannot delete your own account')
      return
    }

    if (confirm('Are you sure you want to delete this user?')) {
      try {
        setError('')
        const token = localStorage.getItem('vms_token')

        if (!token) {
          setError('Not authenticated. Please log in again.')
          return
        }

        const response = await fetch(`http://localhost:3001/api/auth/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.status === 401) {
          const tokenValid = await checkAndRefreshToken()
          if (!tokenValid) {
            setError('Session expired. Please refresh the page and log in again.')
            return
          }
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to delete user')
        }

        await loadUsers()
      } catch (err: any) {
        console.error('Error deleting user:', err)
        setError(err.message)
      }
    }
  }

  const toggleUserStatus = async (userId: string, active: boolean) => {
    if (!hasPermission('users', 'update')) {
      setError('You do not have permission to modify users')
      return
    }

    try {
      setError('')
      const token = localStorage.getItem('vms_token')

      if (!token) {
        setError('Not authenticated. Please log in again.')
        return
      }

      // const response = await fetch(`http://localhost:3001/api/auth/users/${userId}`, {
      //   method: 'PUT',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${token}`
      //   },
      //   body: JSON.stringify({ active })
      // })

      const response = await authFetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData)
      })

      if (response.status === 401) {
        const tokenValid = await checkAndRefreshToken()
        if (!tokenValid) {
          setError('Session expired. Please refresh the page and log in again.')
          return
        }
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update user status')
      }

      await loadUsers()
    } catch (err: any) {
      console.error('Error updating user:', err)
      setError(err.message)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4" />
      case 'operator': return <ShieldCheck className="w-4 h-4" />
      case 'viewer': return <Eye className="w-4 h-4" />
      default: return <Shield className="w-4 h-4" />
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default'
      case 'operator': return 'secondary'
      case 'viewer': return 'outline'
      default: return 'outline'
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString()
  }

  const formatLastLogin = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading users...</p>
          {retryCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">Retry attempt {retryCount}/3</p>
          )}
        </div>
      </div>
    )
  }

  // In demo/offline mode, show a friendly message and do not render server-backed UI
  {
    const mode = localStorage.getItem('vms_session_mode') || 'online'
    const token = localStorage.getItem('vms_token') || ''
    const isDemo = mode === 'demo' || token.startsWith('demo_token_')
    if (isDemo) {
      return (
        <div className="p-6">
          <div className="rounded-md border p-4 bg-amber-50 text-amber-900">
            <div className="font-semibold mb-1">Demo mode (offline)</div>
            User Management requires a real server login. Please sign in with your backend
            admin account (for example <code>admin@vms.com</code>) and try again.
          </div>
        </div>
      )
    }
  }


  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>User Management</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage user accounts, roles, and permissions
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge variant="outline">
              {users.length} Total Users
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={loadUsers}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {hasPermission('users', 'create') && (
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddUser} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select value={formData.role} onValueChange={(value: any) => setFormData({ ...formData, role: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    <div className="flex justify-end space-x-3">
                      <Button type="button" variant="outline" onClick={() => {
                        setShowAddDialog(false)
                        setError('')
                      }}>
                        Cancel
                      </Button>
                      <Button type="submit">Create User</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 p-6 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Administrators</SelectItem>
              <SelectItem value="operator">Operators</SelectItem>
              <SelectItem value="viewer">Viewers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex-shrink-0 p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              {(error.includes('session') || error.includes('expired') || error.includes('log in')) && (
                <Button
                  variant="link"
                  className="ml-2 p-0 h-auto"
                  onClick={() => window.location.reload()}
                >
                  Refresh page
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Users Table */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <Card>
            <CardContent className="p-0">
              {filteredUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                            {user.id === currentUser?.id && (
                              <Badge variant="outline" className="text-xs mt-1">You</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role)} className="flex items-center space-x-1 w-fit">
                            {getRoleIcon(user.role)}
                            <span className="capitalize">{user.role}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.active ? 'default' : 'secondary'}>
                            {user.active ? 'Active' : 'Inactive'}
                          </Badge>
                          {user.failed_login_attempts > 0 && (
                            <div className="text-xs text-red-600 mt-1">
                              {user.failed_login_attempts} failed attempts
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{formatLastLogin(user.last_login)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span>{formatDate(user.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {hasPermission('users', 'update') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleUserStatus(user.id, !user.active)}
                                disabled={user.id === currentUser?.id}
                              >
                                {user.active ? 'Deactivate' : 'Activate'}
                              </Button>
                            )}

                            {hasPermission('users', 'delete') && user.id !== currentUser?.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="font-medium text-gray-900 mb-2">No Users Found</h3>
                  <p className="text-gray-600 mb-4">
                    {error ?
                      'Unable to load users. Check your connection and permissions.' :
                      searchTerm || roleFilter !== 'all' ?
                        'No users match your current filters.' :
                        users.length === 0 ?
                          'No users have been created yet.' :
                          'No users found.'
                    }
                  </p>
                  {!error && (
                    <Button onClick={loadUsers} variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry Loading Users
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}