import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartItem } from '../data/products'

// Cart Service API URL - Using Vite environment variables
const CART_SERVICE_URL = import.meta.env.VITE_CART_SERVICE_URL || 'http://localhost:8080'

// Get or create session ID
const getSessionId = (): string => {
  let sessionId = localStorage.getItem('flashdrop-session-id')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('flashdrop-session-id', sessionId)
  }
  return sessionId
}

interface PaymentDetails {
  cardNumber: string
  cardHolder: string
  expiryMonth: string
  expiryYear: string
  cvv: string
  billingAddress: string
}

interface CheckoutResponse {
  id: string
  sessionId: string
  items: CartItem[]
  total: number
  status: string
  paymentStatus: string
  transactionId: string
  email: string
  createdAt: string
}

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [email, setEmail] = useState('')
  const [payment, setPayment] = useState<PaymentDetails>({
    cardNumber: '',
    cardHolder: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    billingAddress: ''
  })

  // Load cart from service or localStorage
  useEffect(() => {
    const loadCart = async () => {
      try {
        const sessionId = getSessionId()
        
        // Try to fetch from cart service
        const response = await fetch(`${CART_SERVICE_URL}/api/cart/${sessionId}`)
        if (response.ok) {
          const cart = await response.json()
          if (cart.items && cart.items.length > 0) {
            setCartItems(cart.items)
            setLoading(false)
            return
          }
        }
        
        // Fallback to localStorage
        const savedCart = localStorage.getItem('flashdrop-cart')
        if (savedCart) {
          const items = JSON.parse(savedCart)
          setCartItems(items)
          
          // Sync to cart service
          if (items.length > 0) {
            await fetch(`${CART_SERVICE_URL}/api/cart/${sessionId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(items)
            })
          }
        }
      } catch (error) {
        console.log('Cart service not available, using localStorage:', error)
        const savedCart = localStorage.getItem('flashdrop-cart')
        if (savedCart) {
          setCartItems(JSON.parse(savedCart))
        }
      } finally {
        setLoading(false)
      }
    }

    loadCart()
  }, [])

  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  const formatCardNumber = (value: string): string => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }

    if (parts.length) {
      return parts.join(' ')
    } else {
      return value
    }
  }

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value)
    setPayment({ ...payment, cardNumber: formatted })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setProcessing(true)

    try {
      const sessionId = getSessionId()
      
      // Validate form
      if (!email || !payment.cardNumber || !payment.cardHolder || 
          !payment.expiryMonth || !payment.expiryYear || !payment.cvv) {
        throw new Error('Please fill in all required fields')
      }

      // First, ensure cart is synced to service
      await fetch(`${CART_SERVICE_URL}/api/cart/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cartItems)
      })

      // Process checkout
      const response = await fetch(`${CART_SERVICE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          email,
          payment: {
            cardNumber: payment.cardNumber.replace(/\s/g, ''),
            cardHolder: payment.cardHolder,
            expiryMonth: payment.expiryMonth,
            expiryYear: payment.expiryYear,
            cvv: payment.cvv,
            billingAddress: payment.billingAddress
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Checkout failed')
      }

      const order: CheckoutResponse = await response.json()

      // Clear local cart
      localStorage.removeItem('flashdrop-cart')
      window.dispatchEvent(new Event('cartUpdated'))

      // Navigate to success page
      navigate('/checkout/success', { 
        state: { order },
        replace: true 
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.')
      console.error('Checkout error:', err)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#666' }}>
          Loading checkout...
        </div>
      </div>
    )
  }

  if (cartItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Your cart is empty</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Add some items to your cart before checking out.
        </p>
        <Link to="/">
          <button className="btn btn-primary">
            Continue Shopping
          </button>
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <Link to="/cart" style={{ color: '#666', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Cart
      </Link>

      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Checkout
      </h1>

      {error && (
        <div style={{
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          padding: '1rem',
          marginBottom: '1.5rem',
          color: '#721c24'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '2rem' }}>
        {/* Checkout Form */}
        <form onSubmit={handleSubmit}>
          {/* Contact Information */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '1rem' }}>
              📧 Contact Information
            </h2>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          </div>

          {/* Payment Information */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '1rem' }}>
              💳 Payment Information
            </h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Card Number *
              </label>
              <input
                type="text"
                value={payment.cardNumber}
                onChange={handleCardNumberChange}
                placeholder="4111 1111 1111 1111"
                maxLength={19}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Card Holder Name *
              </label>
              <input
                type="text"
                value={payment.cardHolder}
                onChange={(e) => setPayment({ ...payment, cardHolder: e.target.value })}
                placeholder="John Doe"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Expiry Month *
                </label>
                <select
                  value={payment.expiryMonth}
                  onChange={(e) => setPayment({ ...payment, expiryMonth: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">MM</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = (i + 1).toString().padStart(2, '0')
                    return <option key={month} value={month}>{month}</option>
                  })}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Expiry Year *
                </label>
                <select
                  value={payment.expiryYear}
                  onChange={(e) => setPayment({ ...payment, expiryYear: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">YYYY</option>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = (new Date().getFullYear() + i).toString()
                    return <option key={year} value={year}>{year}</option>
                  })}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  CVV *
                </label>
                <input
                  type="text"
                  value={payment.cvv}
                  onChange={(e) => setPayment({ ...payment, cvv: e.target.value.replace(/\D/g, '') })}
                  placeholder="123"
                  maxLength={4}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Billing Address
              </label>
              <input
                type="text"
                value={payment.billingAddress}
                onChange={(e) => setPayment({ ...payment, billingAddress: e.target.value })}
                placeholder="123 Main St, City, Country"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
              />
            </div>
          </div>

          {/* Test Card Info */}
          <div style={{
            background: '#e8f4fd',
            border: '1px solid #b8daff',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem'
          }}>
            <strong>🧪 Test Mode:</strong> Use card <code style={{ background: '#fff', padding: '2px 6px', borderRadius: '3px' }}>4111 1111 1111 1111</code> with any CVV and future expiry date.
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={processing}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.1rem',
              opacity: processing ? 0.7 : 1,
              cursor: processing ? 'not-allowed' : 'pointer'
            }}
          >
            {processing ? '⏳ Processing Payment...' : `💳 Pay $${total.toFixed(2)}`}
          </button>
        </form>

        {/* Order Summary */}
        <div>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '1.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            position: 'sticky',
            top: '2rem'
          }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '1rem' }}>
              📦 Order Summary
            </h2>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
              {cartItems.map((item, index) => (
                <div
                  key={`${item.id}-${item.size}-${index}`}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '0.75rem 0',
                    borderBottom: index < cartItems.length - 1 ? '1px solid #eee' : 'none'
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{
                      width: '60px',
                      height: '60px',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = 'https://via.placeholder.com/60x60?text=Product'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '500', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                      {item.name}
                    </p>
                    <p style={{ color: '#666', fontSize: '0.8rem' }}>
                      Size: {item.size} × {item.quantity}
                    </p>
                  </div>
                  <p style={{ fontWeight: '600' }}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '2px solid #eee', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#666' }}>Shipping</span>
                <span style={{ color: '#28a745' }}>FREE</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span>$0.00</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 'bold',
                fontSize: '1.2rem',
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '2px solid #000'
              }}>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Security Badge */}
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: '#666'
          }}>
            🔒 Secure checkout powered by FlashDrop Cart Service
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
