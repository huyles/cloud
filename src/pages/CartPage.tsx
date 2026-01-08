import React from 'react'
import { Link } from 'react-router-dom'

// Mock cart data
const mockCartItems = [
  {
    id: '1',
    name: 'Air Jordan 1 Retro High',
    price: 170,
    size: '9',
    quantity: 1,
    image: 'https://via.placeholder.com/100x80?text=AJ1'
  },
  {
    id: '2',
    name: 'Adidas Yeezy Boost 350',
    price: 220,
    size: '9.5',
    quantity: 1,
    image: 'https://via.placeholder.com/100x80?text=Yeezy'
  }
]

const CartPage: React.FC = () => {
  const total = mockCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Shopping Cart
      </h1>
      
      {mockCartItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
            Your cart is empty
          </p>
          <Link to="/">
            <button className="btn btn-primary">
              Continue Shopping
            </button>
          </Link>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '2rem' }}>
            {mockCartItems.map(item => (
              <div 
                key={`${item.id}-${item.size}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem',
                  background: 'white',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src={item.image} 
                  alt={item.name}
                  style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                />
                
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {item.name}
                  </h3>
                  <p style={{ color: '#666', fontSize: '0.9rem' }}>
                    Size: {item.size} | Qty: {item.quantity}
                  </p>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ${item.price}
                  </p>
                  <button 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#ff6b6b', 
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                    onClick={() => alert('Remove item functionality')}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '2rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                Total: ${total}
              </h2>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/" style={{ flex: 1 }}>
                <button className="btn btn-secondary" style={{ width: '100%' }}>
                  Continue Shopping
                </button>
              </Link>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => alert('Checkout functionality - would integrate with payment processor')}
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CartPage