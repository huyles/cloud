import React from 'react'
import { useAuth } from '../auth/SimpleAuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  fallback 
}) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem',
        color: '#666'
      }}>
        Loading...
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem'
      }}>
        {fallback || (
          <div>
            <h2 style={{ 
              fontSize: '1.5rem', 
              marginBottom: '1rem',
              color: '#333'
            }}>
              Sign In Required
            </h2>
            <p style={{ 
              color: '#666', 
              marginBottom: '2rem',
              fontSize: '1.1rem'
            }}>
              Please sign in to access this feature.
            </p>
          </div>
        )}
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute