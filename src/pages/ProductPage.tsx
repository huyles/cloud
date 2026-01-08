import React, { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProductById, getLiveInventory, reserveItem, Product, getCurrentPrice, isFlashSaleActive } from '../data/products'
import FlashSaleTimer from '../components/FlashSaleTimer'

const ProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [liveInventory, setLiveInventory] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [selectedSize, setSelectedSize] = useState('')
  const [isReserving, setIsReserving] = useState(false)
  const [reservationStatus, setReservationStatus] = useState<string | null>(null)
  const [saleStatus, setSaleStatus] = useState<string>('none') // Track sale status changes

  // Load product data
  useEffect(() => {
    const loadProduct = async () => {
      if (!id) return
      
      try {
        setLoading(true)
        const productData = await fetchProductById(id)
        setProduct(productData)
        
        if (productData) {
          // Get initial inventory
          const inventory = await getLiveInventory(productData.id)
          setLiveInventory(inventory)
        }
      } catch (error) {
        console.error('Error loading product:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProduct()
  }, [id])

  // Real-time inventory polling
  useEffect(() => {
    if (!product) return

    const updateInventory = async () => {
      try {
        const count = await getLiveInventory(product.id)
        setLiveInventory(count)
      } catch (error) {
        console.error('Error updating inventory:', error)
      }
    }

    // Poll every 3 seconds during flash sales, every 10 seconds otherwise
    const interval = setInterval(updateInventory, product.isFlashSale ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [product])

  const handleReserveItem = async () => {
    if (!selectedSize || !product) {
      alert('Please select a size')
      return
    }

    if (liveInventory <= 0) {
      alert('Sorry, this item is sold out!')
      return
    }

    setIsReserving(true)
    setReservationStatus(null)

    try {
      const result = await reserveItem(product.id, selectedSize, 1)
      
      if (result.success) {
        setReservationStatus('success')
        setLiveInventory(prev => Math.max(0, prev - 1))
        
        // Add item to cart
        const cartItem = {
          id: product.id,
          name: product.name,
          price: getCurrentPrice(product),
          size: selectedSize,
          quantity: 1,
          image: product.image
        }
        
        // Get existing cart from localStorage
        const existingCart = localStorage.getItem('flashdrop-cart')
        let cartItems = existingCart ? JSON.parse(existingCart) : []
        
        // Check if item with same id and size already exists
        const existingItemIndex = cartItems.findIndex(
          (item: any) => item.id === cartItem.id && item.size === cartItem.size
        )
        
        if (existingItemIndex >= 0) {
          // Update quantity if item exists
          cartItems[existingItemIndex].quantity += 1
        } else {
          // Add new item if it doesn't exist
          cartItems.push(cartItem)
        }
        
        // Save updated cart to localStorage
        localStorage.setItem('flashdrop-cart', JSON.stringify(cartItems))
        
        // Trigger cart count update in header
        window.dispatchEvent(new Event('cartUpdated'))
        
        alert(`🎉 Item added to cart! You have 10 minutes to complete checkout.\nReservation ID: ${result.reservationId}`)
      } else {
        setReservationStatus('failed')
        alert('Sorry, item sold out during reservation. Please try another size.')
      }
    } catch (error) {
      setReservationStatus('failed')
      alert('Reservation failed. Please try again.')
      console.error('Reservation error:', error)
    } finally {
      setIsReserving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#666' }}>
          Loading product details...
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>Product Not Found</h2>
        <Link to="/">
          <button className="btn btn-primary">Back to Products</button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link to="/" style={{ color: '#666', textDecoration: 'none', marginBottom: '2rem', display: 'inline-block' }}>
        ← Back to Products
      </Link>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start' }}>
        <div>
          {product.isFlashSale && (
            <div className="flash-sale-badge" style={{ marginBottom: '1rem' }}>
              🔥 FLASH SALE - LIMITED TIME
            </div>
          )}
          
          {/* Flash Sale Timer */}
          {product.flashSale && (
            <div style={{ marginBottom: '1rem' }}>
              <FlashSaleTimer 
                flashSale={product.flashSale}
                onStatusChange={(status) => {
                  setSaleStatus(status) // Update sale status to trigger price recalculation
                  // Refresh inventory when flash sale status changes
                  if (status === 'active' || status === 'ended') {
                    getLiveInventory(product.id).then(setLiveInventory)
                  }
                }}
              />
            </div>
          )}
          
          <img 
            src={product.image} 
            alt={product.name}
            style={{ width: '100%', borderRadius: '8px' }}
          />
        </div>
        
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            {product.name}
          </h1>
          
          {/* Dynamic pricing based on flash sale */}
          <div style={{ marginBottom: '1.5rem' }}>
            {product.flashSale && isFlashSaleActive(product.flashSale) ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
                  <span style={{ 
                    fontSize: '2.5rem', 
                    fontWeight: 'bold', 
                    color: '#ff6b6b'
                  }}>
                    ${getCurrentPrice(product)}
                  </span>
                  <span style={{ 
                    fontSize: '1.5rem', 
                    textDecoration: 'line-through', 
                    color: '#999'
                  }}>
                    ${product.price}
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ 
                    background: '#ff6b6b',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '1rem'
                  }}>
                    {Math.round(((product.price - getCurrentPrice(product)) / product.price) * 100)}% OFF
                  </div>
                  <span style={{ 
                    color: '#28a745', 
                    fontWeight: 'bold',
                    fontSize: '1.1rem'
                  }}>
                    You save ${product.price - getCurrentPrice(product)}!
                  </span>
                </div>
                
                <div style={{ 
                  background: '#fff3cd',
                  border: '1px solid #ffeaa7',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#856404',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  🔥 <strong>Flash Sale Price!</strong> Limited time offer - regular price ${product.price}
                </div>
              </div>
            ) : product.flashSale ? (
              <div>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#666' }}>
                  ${product.price}
                </p>
                <div style={{ 
                  background: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#6c757d',
                  fontSize: '0.9rem'
                }}>
                  ⏰ Flash sale not currently active. Check back later for special pricing!
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                ${getCurrentPrice(product)}
              </p>
            )}
          </div>
          
          <p style={{ color: '#666', marginBottom: '2rem', lineHeight: '1.6' }}>
            {product.description}
          </p>
          
          {/* Real-time inventory display */}
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
              Stock: <span style={{ color: liveInventory < 10 ? '#ff6b6b' : '#333' }}>
                {liveInventory} remaining
              </span>
            </p>
            {liveInventory < 10 && liveInventory > 0 && (
              <p style={{ color: '#ff6b6b', fontSize: '0.9rem', fontWeight: 'bold' }}>
                ⚡ Only {liveInventory} left - Act fast!
              </p>
            )}
            {liveInventory === 0 && (
              <p style={{ color: '#ff6b6b', fontSize: '1rem', fontWeight: 'bold' }}>
                🚫 SOLD OUT
              </p>
            )}
            {product.isFlashSale && (
              <p style={{ color: '#ff6b6b', fontSize: '0.8rem', fontStyle: 'italic' }}>
                📊 Live inventory updates every 3 seconds
              </p>
            )}
          </div>
          
          {/* Size selection */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
              Size:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {product.sizes.map(size => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  disabled={liveInventory === 0}
                  style={{
                    padding: '0.5rem 1rem',
                    border: selectedSize === size ? '2px solid #000' : '1px solid #ccc',
                    background: selectedSize === size ? '#f0f0f0' : 'white',
                    borderRadius: '4px',
                    cursor: liveInventory === 0 ? 'not-allowed' : 'pointer',
                    opacity: liveInventory === 0 ? 0.5 : 1
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          
          {/* Reserve button */}
          <button 
            onClick={handleReserveItem}
            disabled={isReserving || liveInventory === 0 || !selectedSize}
            className="btn btn-primary"
            style={{ 
              width: '100%', 
              fontSize: '1.1rem', 
              padding: '1rem',
              opacity: (isReserving || liveInventory === 0 || !selectedSize) ? 0.7 : 1,
              background: liveInventory === 0 ? '#ccc' : undefined
            }}
          >
            {isReserving ? (
              '⏳ Reserving...'
            ) : liveInventory === 0 ? (
              '🚫 SOLD OUT'
            ) : !selectedSize ? (
              'Select Size First'
            ) : product.isFlashSale ? (
              '🔥 Reserve Now - Flash Sale!'
            ) : (
              '🛒 Reserve Item'
            )}
          </button>

          {/* Reservation status */}
          {reservationStatus === 'success' && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: '#d4edda', 
              border: '1px solid #c3e6cb',
              borderRadius: '4px',
              color: '#155724'
            }}>
              ✅ Item reserved successfully! Complete checkout within 10 minutes.
            </div>
          )}

          {/* Flash sale urgency */}
          {product.isFlashSale && liveInventory > 0 && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: '#fff3cd', 
              border: '1px solid #ffeaa7',
              borderRadius: '4px',
              color: '#856404'
            }}>
              ⚡ Flash Sale Alert: High demand! Inventory updates in real-time.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProductPage
