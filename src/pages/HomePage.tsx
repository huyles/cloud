import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts, Product } from '../data/products'

const HomePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true)
        setError(null)
        console.log('🔄 Loading products...')
        
        const data = await fetchProducts()
        console.log('✅ Products loaded:', data.length, 'items')
        setProducts(data)
      } catch (err) {
        console.error('❌ Error loading products:', err)
        setError('Failed to load products')
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#666' }}>
          Loading flash sale products...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#ff6b6b', marginBottom: '1rem' }}>
          {error}
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="btn btn-primary"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!products || products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#666', marginBottom: '1rem' }}>
          No products available
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="btn btn-primary"
        >
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Limited Edition Sneakers
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Exclusive drops and flash sales
        </p>
        {products.length > 0 && (
          <p style={{ fontSize: '1rem', color: '#ff6b6b', fontWeight: 'bold' }}>
            🔥 {products.filter(p => p.isFlashSale).length} Flash Sales Active Now!
          </p>
        )}
      </div>

      <div className="product-grid">
        {products.map(product => (
          <div key={product.id} className="product-card">
            {product.isFlashSale && (
              <div className="flash-sale-badge">
                FLASH SALE
              </div>
            )}
            <img 
              src={product.image} 
              alt={product.name}
              className="product-image"
              onError={(e) => {
                console.log('🖼️ Image failed to load:', product.image)
                // You could set a fallback image here
              }}
            />
            <div className="product-info">
              <h3 className="product-name">{product.name}</h3>
              <p className="product-price">${product.price}</p>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
                {product.inventory} left in stock
              </p>
              {product.inventory < 20 && (
                <p style={{ color: '#ff6b6b', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                  ⚡ Low Stock - Act Fast!
                </p>
              )}
              <Link to={`/product/${product.id}`}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                  disabled={product.inventory === 0}
                >
                  {product.inventory === 0 ? 'SOLD OUT' : 'View Details'}
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Debug info in development */}
      {import.meta.env.DEV && (
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          background: '#f8f9fa', 
          borderRadius: '4px',
          fontSize: '0.9rem',
          color: '#666'
        }}>
          🔧 Debug: Loaded {products.length} products in development mode
        </div>
      )}
    </div>
  )
}

export default HomePage