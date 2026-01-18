import React, { useState, useEffect } from 'react'
import { getCurrentUser, signOut } from 'aws-amplify/auth'
import LoginModal from './LoginModal'

const AuthButton: React.FC = () => {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    checkAuthState()
  }, [])

  const checkAuthState = async () => {
    try {
      // Check if user is signed in with Amplify
      const currentUser = await getCurrentUser()
      if (currentUser) {
        const userInfo = {
          email: currentUser.username,
          name: currentUser.username.split('@')[0],
          sub: currentUser.userId
        }
        setUser(userInfo)
        localStorage.setItem('auth-user', JSON.stringify(userInfo))
      }
    } catch (error) {
      // No user signed in
      setUser(null)
      localStorage.removeItem('auth-user')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoginSuccess = (userData: any) => {
    setUser(userData)
    localStorage.setItem('auth-user', JSON.stringify(userData))
    console.log('✅ User authenticated:', userData.email)
  }

  const handleSignOut = async () => {
    try {
      // Sign out from Amplify (clears Amplify session)
      await signOut()
      console.log('✅ Signed out from Amplify')
    } catch (error) {
      console.error('❌ Sign out error:', error)
    } finally {
      // Clear local state regardless
      setUser(null)
      localStorage.removeItem('auth-user')
      console.log('👋 User signed out')
    }
  }

  if (isLoading) {
    return (
      <div style={{ color: '#666', fontSize: '0.9rem' }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowLoginModal(true)}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#0056b3'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#007bff'
          }}
        >
          Sign In
        </button>
        
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        color: '#333',
        fontSize: '0.9rem'
      }}>
        <span style={{ 
          width: '8px', 
          height: '8px', 
          background: '#28a745', 
          borderRadius: '50%' 
        }}></span>
        {user.email || user.name || 'User'}
      </div>
      <button
        onClick={handleSignOut}
        style={{
          background: 'transparent',
          color: '#666',
          border: '1px solid #ddd',
          padding: '0.4rem 0.8rem',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.85rem'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = '#f8f9fa'
          e.currentTarget.style.color = '#333'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#666'
        }}
      >
        Sign Out
      </button>
    </div>
  )
}

export default AuthButton