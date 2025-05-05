'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useUser } from '@/components/user-provider'
import { GroupedHistory, PromptHistoryEntry } from '@/lib/db-service'
import { Clock, MessageSquare, X, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface HistorySidebarProps {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (sessionId: string) => void
}

export function HistorySidebar({ isOpen, onClose, onSelectSession }: HistorySidebarProps) {
  const { userId, isAuthenticated } = useUser()
  const [history, setHistory] = useState<GroupedHistory | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    today: true,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  })

  // Fetch history when the sidebar is opened
  useEffect(() => {
    if (isOpen && isAuthenticated && userId) {
      fetchHistory()
    }
  }, [isOpen, isAuthenticated, userId])

  const fetchHistory = async () => {
    if (!userId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/conversation?action=getPromptHistory&userId=${userId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch history')
      }
      
      const data = await response.json()
      setHistory(data.history)
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }))
  }

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId)
    onClose()
  }

  // Group entries by session
  const groupSessionsByDate = (entries: PromptHistoryEntry[]) => {
    const sessions: Record<string, PromptHistoryEntry[]> = {}
    
    entries.forEach(entry => {
      if (!sessions[entry.session_id]) {
        sessions[entry.session_id] = []
      }
      sessions[entry.session_id].push(entry)
    })
    
    return Object.entries(sessions).map(([sessionId, entries]) => ({
      sessionId,
      entries,
      firstEntry: entries[0],
      date: new Date(entries[0].created_at as Date)
    }))
  }

  // Render a time period group
  const renderTimeGroup = (title: string, entries: PromptHistoryEntry[], groupKey: string) => {
    if (!entries || entries.length === 0) return null
    
    const sessions = groupSessionsByDate(entries)
    
    return (
      <div className="mb-4">
        <div 
          className="flex items-center justify-between cursor-pointer py-2"
          onClick={() => toggleGroup(groupKey)}
        >
          <h3 className="text-sm font-medium">{title}</h3>
          <ChevronRight 
            className={`h-4 w-4 transition-transform ${expandedGroups[groupKey] ? 'rotate-90' : ''}`} 
          />
        </div>
        
        {expandedGroups[groupKey] && (
          <div className="pl-2 space-y-2 mt-1">
            {sessions.map(session => (
              <div 
                key={session.sessionId}
                className="rounded-md border p-2 cursor-pointer hover:bg-accent"
                onClick={() => handleSelectSession(session.sessionId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate max-w-[180px]">
                      {session.firstEntry.prompt.substring(0, 30)}
                      {session.firstEntry.prompt.length > 30 ? '...' : ''}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(session.date, 'HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {session.entries.length} message{session.entries.length !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-80 bg-background border-r border-border shadow-lg">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Conversation History</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="h-[calc(100vh-60px)] p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-sm text-muted-foreground">Loading history...</div>
          </div>
        ) : !history ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-sm text-muted-foreground">No history found</div>
          </div>
        ) : (
          <div>
            {renderTimeGroup('Today', history.today, 'today')}
            {renderTimeGroup('Yesterday', history.yesterday, 'yesterday')}
            {renderTimeGroup('Last Week', history.lastWeek, 'lastWeek')}
            {renderTimeGroup('Last Month', history.lastMonth, 'lastMonth')}
            {renderTimeGroup('Older', history.older, 'older')}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}