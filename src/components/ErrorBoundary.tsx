'use client'

import React from 'react'
import { isEnabled } from '@/lib/flags'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  name?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.name}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div style={{
          padding: '20px',
          background: '#0A0F1A',
          border: '1px solid #1E293B',
          borderRadius: '8px',
          color: '#6B7280',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: '12px'
        }}>
          <div style={{
            color: '#EF4444',
            marginBottom: '8px',
            fontSize: '11px',
            letterSpacing: '2px'
          }}>
            COMPONENT ERROR
          </div>
          {isEnabled('DEV_PANEL') && (
            <div style={{
              color: '#374151',
              fontSize: '10px',
              fontFamily: 'monospace'
            }}>
              {this.state.error?.message}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '12px',
              padding: '4px 12px',
              background: '#1E293B',
              border: 'none',
              borderRadius: '4px',
              color: '#9CA3AF',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

