// AWS API Configuration - Using Vite environment variables
const BROWSE_API = import.meta.env.VITE_BROWSE_API_URL || ''
const INVENTORY_API = import.meta.env.VITE_INVENTORY_API_URL || ''
const S3_BUCKET = import.meta.env.VITE_S3_BUCKET_URL || ''

// Product interface
export interface Product {
  id: string
  name: string
  price: number
  image: string
  description: string
  sizes: string[]
  isFlashSale: boolean
  inventory: number
}

// Cart item interface
export interface CartItem {
  id: string
  name: string
  price: number
  size: string
  quantity: number
  image: string
}

// Mock data for local development and fallback
const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Air Jordan 1 Retro High',
    price: 170,
    image: '/Giay-Nike-Air-Jordan-1-Retro-High-85-Black-White-BQ4422-001.jpg',
    description: 'The Air Jordan 1 Retro High remakes the classic sneaker, giving you a fresh take on what you know: crisp leather, bold color-blocking and the iconic Wings logo.',
    sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'],
    isFlashSale: true,
    inventory: 25
  },
  {
    id: '2',
    name: 'Nike Dunk Low',
    price: 100,
    image: '/NIKE+DUNK+LOW+NN.avif',
    description: 'The Nike Dunk Low brings retro basketball style to the streets. With its classic colorways and premium materials, it\'s a timeless choice for sneaker enthusiasts.',
    sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'],
    isFlashSale: false,
    inventory: 50
  },
  {
    id: '3',
    name: 'Adidas Yeezy Boost 350',
    price: 220,
    image: '/263577175_593534718561359_6151444724673571862_n.webp',
    description: 'The Yeezy Boost 350 features a Primeknit upper and Boost midsole for ultimate comfort and style. A must-have for any sneaker collection.',
    sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'],
    isFlashSale: true,
    inventory: 10
  },
  {
    id: '4',
    name: 'New Balance 550',
    price: 110,
    image: '/giay-new-balance-nb-chinh-hang-bb550wt1-11.jpg',
    description: 'The New Balance 550 is a classic basketball silhouette reimagined for today. Clean lines and premium leather make it perfect for everyday wear.',
    sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'],
    isFlashSale: false,
    inventory: 30
  }
]

// Product browsing APIs (Lambda functions via API Gateway)
export const fetchProducts = async (): Promise<Product[]> => {
  // If no API URL configured, return mock data immediately
  if (!BROWSE_API) {
    console.log('🔧 Using mock data - no API configured')
    return mockProducts
  }

  try {
    const response = await fetch(`${BROWSE_API}/products`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const products = await response.json()
    
    // Add S3 URL prefix to images if using S3
    return products.map((product: Product) => ({
      ...product,
      image: product.image.startsWith('http') ? product.image : `${S3_BUCKET}${product.image}`
    }))
  } catch (error) {
    console.log('🔧 Using mock data - AWS API not available:', error)
    return mockProducts
  }
}

export const fetchProductById = async (id: string): Promise<Product | null> => {
  // If no API URL configured, return mock data immediately
  if (!BROWSE_API) {
    console.log('🔧 Using mock data - no API configured')
    return mockProducts.find(product => product.id === id) || null
  }

  try {
    const response = await fetch(`${BROWSE_API}/products/${id}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const product = await response.json()
    
    // Add S3 URL prefix to image if using S3
    return {
      ...product,
      image: product.image.startsWith('http') ? product.image : `${S3_BUCKET}${product.image}`
    }
  } catch (error) {
    console.log('🔧 Using mock data - AWS API not available:', error)
    return mockProducts.find(product => product.id === id) || null
  }
}

// Real-time inventory APIs (ECS service via API Gateway)
export const getLiveInventory = async (productId: string): Promise<number> => {
  // If no API URL configured, return mock inventory immediately
  if (!INVENTORY_API) {
    const product = mockProducts.find(p => p.id === productId)
    return product?.inventory || 0
  }

  try {
    const response = await fetch(`${INVENTORY_API}/inventory/${productId}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const data = await response.json()
    return data.remaining || 0
  } catch (error) {
    console.log('🔧 Using mock inventory - AWS API not available:', error)
    const product = mockProducts.find(p => p.id === productId)
    return product?.inventory || 0
  }
}

// Inventory reservation (ECS service with locking)
export const reserveItem = async (productId: string, size: string, quantity: number = 1) => {
  // If no API URL configured, return mock success immediately
  if (!INVENTORY_API) {
    console.log('🔧 Mock reservation - no API configured')
    return {
      success: true,
      reservationId: `mock-${Date.now()}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      message: 'Item reserved successfully (mock mode)'
    }
  }

  try {
    const response = await fetch(`${INVENTORY_API}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId,
        size,
        quantity,
        timestamp: new Date().toISOString()
      })
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.log('🔧 Mock reservation - AWS API not available:', error)
    // Mock successful reservation for local development
    return {
      success: true,
      reservationId: `mock-${Date.now()}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      message: 'Item reserved successfully (mock mode)'
    }
  }
}

// Legacy function for backward compatibility
export const getProductById = (id: string) => {
  return mockProducts.find(product => product.id === id)
}

// Export mock data for local development
export { mockProducts }