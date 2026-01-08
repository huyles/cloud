import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts, Product, getCurrentPrice, isFlashSaleActive } from '../data/products'
import FlashSaleTimer from '../components/FlashSaleTimer'

// Product Card Component that updates pricing when timer changes
const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const [saleStatus, setSaleStatus] = useState<string>('none')
  
  // Recalculate pricing whenever sale status changes
  const currentPrice = getCurrentPrice(product)
  const isOnSale = product.flashSale && isFlashSaleActive(product.flashSale)
  
  return (
    <div className="product-card">
      {product.isFlashSale && (
        <div className="flash-sale-badge">
          FLASH SALE
        </div>
      )}
      
      {/* Flash Sale Timer */}
      {product.flashSale && (
        <FlashSaleTimer 
          flashSale={product.flashSale}
          onStatusChange={(status) => {
            setSaleStatus(status)
            // This will trigger a re-render and recalculate pricing
          }}
        />
      )}
      
      <img 
        src={product.image} 
        alt={product.name}
        className="product-image"
        onError={() => {
          console.log('🖼️ Image failed to load:', product.image)
        }}
      />
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        
        {/* Price with sale indication - updates when saleStatus changes */}
        <div className="product-price" style={{ marginBottom: '0.5rem' }}>
          {isOnSale ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ 
                  color: '#ff6b6b', 
                  fontWeight: 'bold', 
                  fontSize: '1.4rem' 
                }}>
                  ${currentPrice}
                </span>
                <span style={{ 
                  textDecoration: 'line-through', 
                  color: '#999', 
                  fontSize: '1.1rem'
                }}>
                  ${product.price}
                </span>
              </div>
              <div style={{ 
                color: '#fff', 
                background: '#ff6b6b',
                fontSize: '0.75rem', 
                fontWeight: 'bold',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                display: 'inline-block'
              }}>
                SAVE ${product.price - currentPrice} ({Math.round(((product.price - currentPrice) / product.price) * 100)}% OFF)
              </div>
            </div>
          ) : (
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>${currentPrice}</span>
          )}
        </div>
        
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
  )
}

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
        {products.map(product => {
          return (
            <ProductCard key={product.id} product={product} />
          )
        })}
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
          🔧 Debug: Loa
