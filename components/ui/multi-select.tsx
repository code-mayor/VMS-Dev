import React, { useState, useRef, useEffect } from 'react'
import { Button } from './button'
import { Badge } from './badge'
import { Input } from './input'
import { Card } from './card'
import { Checkbox } from './checkbox'
import { ScrollArea } from './scroll-area'
import { 
  ChevronDown, 
  X, 
  Search,
  Check
} from 'lucide-react'

interface Option {
  value: string
  label: string
  disabled?: boolean
  description?: string
}

interface MultiSelectProps {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  maxHeight?: number
  className?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  disabled = false,
  maxHeight = 300,
  className = ""
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter options based on search query
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Get selected option labels
  const selectedOptions = options.filter(option => value.includes(option.value))

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleToggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const handleRemoveOption = (optionValue: string) => {
    onChange(value.filter(v => v !== optionValue))
  }

  const handleSelectAll = () => {
    const availableOptions = filteredOptions.filter(option => !option.disabled)
    const allValues = availableOptions.map(option => option.value)
    const newValue = [...new Set([...value, ...allValues])]
    onChange(newValue)
  }

  const handleClearAll = () => {
    onChange([])
  }

  const handleClearSearch = () => {
    setSearchQuery('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full justify-between h-auto min-h-[2.5rem] px-3 py-2"
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            <>
              {selectedOptions.slice(0, 2).map(option => (
                <div
                  key={option.value}
                  className="flex items-center text-xs px-2 py-0.5 bg-gray-200 text-gray-800 rounded"
                >
                  {option.label}
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveOption(option.value)
                    }}
                    className="ml-1 cursor-pointer hover:bg-gray-300 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </div>
                </div>
              ))}
              {selectedOptions.length > 2 && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded border">
                  +{selectedOptions.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 border shadow-lg">
          <div className="p-3 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSearch}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={filteredOptions.length === 0}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={value.length === 0}
                >
                  Clear All
                </Button>
              </div>
              <div className="text-xs text-gray-500">
                {value.length} of {options.length} selected
              </div>
            </div>

            {/* Options List */}
            <ScrollArea className="h-full" style={{ maxHeight: `${maxHeight}px` }}>
              <div className="space-y-1">
                {filteredOptions.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    {searchQuery ? 'No options match your search' : 'No options available'}
                  </div>
                ) : (
                  filteredOptions.map(option => {
                    const isSelected = value.includes(option.value)
                    return (
                      <div
                        key={option.value}
                        className={`flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer ${
                          option.disabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        onClick={() => !option.disabled && handleToggleOption(option.value)}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={option.disabled}
                          onChange={() => !option.disabled && handleToggleOption(option.value)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{option.label}</div>
                          {option.description && (
                            <div className="text-xs text-gray-500 truncate">
                              {option.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </Card>
      )}
    </div>
  )
}