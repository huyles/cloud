import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts, Product, isFlashSaleActive, getCurrentPrice, getDiscountPercentage } from '../data/products'
import FlashSaleTimer from '../components/FlashSaleTimer'

const HomePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const fetchedProducts = await fetchProducts()
        setProducts(fetchedProducts)
      } catch (error) {
        console.error('Error loading products:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProducts()
  }, [])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading amazing sneakers...</p>
      </div>
    )
  }

  const flashSaleProducts = products.filter(p => p.isFlashSale && isFlashSaleActive(p.flashSale))
  const activeFlashSales = flashSaleProducts.length

  return (
    <div className="homepage-container">
      {/* Main Header */}
      <div className="main-header">
        <h1 className="main-title">Limited Edition Sneakers</h1>
        <p className="main-subtitle">Exclusive drops and flash sales</p>
        {activeFlashSales > 0 && (
          <div className="flash-sale-indicator">
            🔥 {activeFlashSales} Flash Sales Active Now!
          </div>
        )}
      </div>

      {/* Products Grid */}
      <div className="products-container">
        {products.map(product => {
          const isOnSale = product.flashSale && isFlashSaleActive(product.flashSale)

          return (
            <div key={product.id} className="product-item">
              {/* Flash Sale Badge */}
              {isOnSale && (
                <div className="flash-sale-badge">
                  FLASH SALE
                </div>
              )}
              
              {/* Flash Sale Timer */}
              {isOnSale && product.flashSale && (
                <div className="flash-sale-timer">
                  🔥 <FlashSaleTimer endTime={product.flashSale.endTime} compact={true} />
                  <div className="stock-info">Only 10 left!</div>
                </div>
              )}

              {/* Product Image */}
              <div className="product-image-wrapper">
                <img 
                  src={product.image} 
                  alt={product.name}
                  className="product-image"
                />
              </div>

              {/* Product Info */}
              <div className="product-details">
                <h3 className="product-name">{product.name}</h3>
                
                {/* Price Section */}
                <div className="price-section">
                  {product.isFlashSale ? (
                    <>
                      <span className="original-price">${product.price}</span>
                      <span className="sale-price">${getCurrentPrice(product)}</span>
                      <div className="savings-badge">
                        {getDiscountPercentage()}% OFF
                      </div>
                    </>
                  ) : (
                    <span className="regular-price">${getCurrentPrice(product)}</span>
                  )}
                </div>

                {/* Stock Info */}
                <div className="stock-status">
                  {product.inventory} left in stock
                </div>

                {/* View Details Button */}
                <Link to={`/product/${product.id}`}>
                  <button className="view-details-btn">
                    View Details
                  </button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HomePage
