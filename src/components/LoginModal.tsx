import React, { useState } from 'react'
import { signIn, signUp, confirmSignUp, SignInInput, SignUpInput, ConfirmSignUpInput } from 'aws-amplify/auth'
import { Amplify } from 'aws-amplify'

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_PwQP9Qqmv',
      userPoolClientId: '43viiabhbbivnn1rn0qj7nkogj'
    }
  }
})

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: any) => void
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'verify'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'login') {
        await loginUser(email, password)
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match')
        }
        await signUpUser(email, password)
      } else if (mode === 'verify') {
        await verifyUser(email, verificationCode)
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const loginUser = async (email: string, password: string) => {
    try {
      const signInInput: SignInInput = {
        username: email,
        password: password
      }
      
      const result = await signIn(signInInput)
      console.log('✅ Login successful:', result)
      
      const userInfo = {
        email: email,
        name: email.split('@')[0],
        sub: result.nextStep ? 'pending' : 'confirmed',
        isSignedIn: result.isSignedIn
      }

      onSuccess(userInfo)
      onClose()
    } catch (error: any) {
      console.error('❌ Login failed:', error)
      if (error.name === 'UserNotConfirmedException') {
        setError('Please verify your email first. Check your inbox for the verification code.')
        setMode('verify')
      } else {
        throw error
      }
    }
  }

  const signUpUser = async (email: string, password: string) => {
    try {
      const signUpInput: SignUpInput = {
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email
          }
        }
      }
      
      const result = await signUp(signUpInput)
      console.log('✅ Sign up successful:', result)
      
      setSuccess('Account created! Please check your email for the verification code.')
      setMode('verify')
    } catch (error: any) {
      console.error('❌ Sign up failed:', error)
      throw error
    }
  }

  const verifyUser = async (email: string, code: string) => {
    try {
      const confirmInput: ConfirmSignUpInput = {
        username: email,
        confirmationCode: code
      }
      
      await confirmSignUp(confirmInput)
      console.log('✅ Email verification successful')
      
      setSuccess('Email verified! You can now sign in.')
      setMode('login')
      setVerificationCode('')
    } catch (error: any) {
      console.error('❌ Email verification failed:', error)
      throw error
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setVerificationCode('')
    setError('')
    setSuccess('')
  }

  const switchMode = (newMode: 'login' | 'signup' | 'verify') => {
    setMode(newMode)
    setError('')
    setSuccess('')
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        width: '400px',
        maxWidth: '90vw'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Verify Email'}
          </h2>
          <button
            onClick={() => {
              resetForm()
              onClose()
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode !== 'verify' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#333' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {mode !== 'verify' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#333' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#333' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {mode === 'verify' && (
            <>
              <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
                Enter the verification code sent to: <strong>{email}</strong>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#333' }}>
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  required
                  placeholder="Enter 6-digit code"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </>
          )}

          {error && (
            <div style={{
              color: '#dc3545',
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              color: '#28a745',
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1rem'
            }}
          >
            {loading ? 'Processing...' : 
             mode === 'login' ? 'Sign In' : 
             mode === 'signup' ? 'Sign Up' : 
             'Verify Email'}
          </button>

          <div style={{ textAlign: 'center' }}>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => switchMode('signup')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#007bff',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Don't have an account? Sign Up
              </button>
            )}
            {mode === 'signup' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#007bff',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Already have an account? Sign In
              </button>
            )}
            {mode === 'verify' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#007bff',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Back to Sign In
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginModal