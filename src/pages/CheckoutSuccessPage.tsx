import React from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'

interface OrderItem {
  id: string
  name: string
  price: number
  size: string
  quantity: number
  image: string
}

interface Order {
  id: string
  sessionId: string
  items: OrderItem[]
  total: number
  status: string
  paymentStatus: string
  transactionId: string
  email: string
  createdAt: string
}

const CheckoutSuccessPage: React.FC = () => {
  const location = useLocation()
  const order = location.state?.order as Order | undefined

  // Redirect if no order data
  if (!order) {
    return <Navigate to="/" replace />
  }

  const orderDate = new Date(order.createdAt)

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      textAlign: 'center',
      padding: '2rem'
    }}>
      {/* Success Animation */}
      <div style={{
        width: '100px',
        height: '100px',
        background: 'linear-gradient(135deg, #28a745, #20c997)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 2rem',
        animation: 'pulse 2s infinite',
        boxShadow: '0 10px 40px rgba(40, 167, 69, 0.3)'
      }}>
        <span style={{ fontSize: '3rem' }}>✓</span>
      </div>

      <h1 style={{ 
        fontSize: '2.5rem', 
        fontWeight: 'bold', 
        marginBottom: '1rem',
        color: '#28a745'
      }}>
        Order Confirmed! 🎉
      </h1>

      <p style={{ 
        fontSize: '1.2rem', 
        color: '#666', 
        marginBottom: '2rem' 
      }}>
        Thank you for your purchase! Your order has been successfully placed.
      </p>

      {/* Order Details Card */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        textAlign: 'left'
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div>
            <h3 style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              ORDER ID
            </h3>
            <p style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '1rem' }}>
              {order.id.substring(0, 8).toUpperCase()}
            </p>
          </div>
          <div>
            <h3 style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              TRANSACTION ID
            </h3>
            <p style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '1rem' }}>
              {order.transactionId}
            </p>
          </div>
          <div>
            <h3 style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              ORDER DATE
            </h3>
            <p style={{ fontWeight: '600' }}>
              {orderDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div>
            <h3 style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              EMAIL
            </h3>
            <p style={{ fontWeight: '600' }}>
              {order.email}
            </p>
          </div>
        </div>

        {/* Order Status */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            background: '#d4edda',
            color: '#155724',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}>
            ✓ {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </div>
          <div style={{
            background: '#d4edda',
            color: '#155724',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}>
            💳 {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
          </div>
        </div>

        {/* Order Items */}
        <h3 style={{ 
          fontSize: '1.1rem', 
          fontWeight: '600', 
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '2px solid #eee'
        }}>
          Order Items
        </h3>

        {order.items.map((item, index) => (
          <div
            key={`${item.id}-${item.size}-${index}`}
            style={{
              display: 'flex',
              gap: '1rem',
              padding: '1rem 0',
              borderBottom: index < order.items.length - 1 ? '1px solid #eee' : 'none',
              alignItems: 'center'
            }}
          >
            <img
              src={item.image}
              alt={item.name}
              style={{
                width: '70px',
                height: '70px',
                objectFit: 'cover',
                borderRadius: '8px'
              }}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = 'https://via.placeholder.com/70x70?text=Product'
              }}
            />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                {item.name}
              </p>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                Size: {item.size} • Quantity: {item.quantity}
              </p>
            </div>
            <p style={{ fontWeight: '700', fontSize: '1.1rem' }}>
              ${(item.price * item.quantity).toFixed(2)}
            </p>
          </div>
        ))}

        {/* Total */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '3px solid #000'
        }}>
          <span style={{ fontSize: '1.3rem', fontWeight: '700' }}>
            Total Paid
          </span>
          <span style={{ 
            fontSize: '1.8rem', 
            fontWeight: '700', 
            color: '#28a745' 
          }}>
            ${order.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Email Notification */}
      <div style={{
        background: '#e8f4fd',
        border: '1px solid #b8daff',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '2rem',
        textAlign: 'left'
      }}>
        <p style={{ margin: 0 }}>
          📧 A confirmation email has been sent to <strong>{order.email}</strong>
        </p>
      </div>

      {/* Estimated Delivery */}
      <div style={{
        background: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '2rem',
        textAlign: 'left'
      }}>
        <p style={{ margin: 0 }}>
          📦 <strong>Estimated Delivery:</strong> {new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })} - {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link to="/">
          <button
            className="btn btn-primary"
            style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
          >
            🛍️ Continue Shopping
          </button>
        </Link>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 10px 40px rgba(40, 167, 69, 0.3);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 15px 50px rgba(40, 167, 69, 0.4);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 10px 40px rgba(40, 167, 69, 0.3);
          }
        }
      `}</style>
    </div>
  )
}

export default CheckoutSuccessPage
