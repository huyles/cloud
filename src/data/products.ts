// AWS API Configuration - Using Vite environment variables
const BROWSE_API = import.meta.env.VITE_BROWSE_API_URL || ''
const INVENTORY_API = import.meta.env.VITE_INVENTORY_API_URL || ''
const S3_BUCKET = import.meta.env.VITE_S3_BUCKET_URL || ''

// Import auth functions
// Note: We can't use hooks directly in utility functions, so we'll need to pass auth headers from components

// Flash sale interface
export interface FlashSale {
  id: string
  startTime: string // ISO timestamp
  endTime: string   // ISO timestamp
  originalPrice: number
  salePrice: number
  maxQuantity: number
  soldQuantity: number
  isActive: boolean
}

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
  flashSale?: FlashSale // Optional flash sale details
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
    inventory: 25,
    flashSale: {
      id: 'flash-1',
      startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // Started 10 minutes ago
      endTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),   // Ends in 45 minutes
      originalPrice: 170,
      salePrice: 129, // 24% off - realistic sneaker sale
      maxQuantity: 100,
      soldQuantity: 75,
      isActive: true
    }
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
    inventory: 10,
    flashSale: {
      id: 'flash-3',
      startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Started 5 minutes ago
      endTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(),   // Ends in 25 minutes
      originalPrice: 220,
      salePrice: 179, // 19% off - premium sneaker sale
      maxQuantity: 50,
      soldQuantity: 40,
      isActive: true
    }
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

// Helper function to get headers with auth token
const getAuthHeaders = async (authToken?: string): Promise<HeadersInit> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  // Add auth token if provided
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  
  return headers
}

// Product browsing APIs (Lambda functions via API Gateway)
export const fetchProducts = async (authToken?: string): Promise<Product[]> => {
  // If no API URL configured, return mock data immediately
  if (!BROWSE_API) {
    console.log('🔧 Using mock data - no API configured')
    return mockProducts
  }

  try {
    const headers = await getAuthHeaders(authToken)
    const response = await fetch(`${BROWSE_API}/products`, { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const data = await response.json()
    
    // Log raw API response for debugging
    console.log('📦 Raw API response:', JSON.stringify(data, null, 2))
    
    // Lambda returns { products: [...] } so we need to extract the array
    // Handle both formats: { products: [...] } or direct array [...]
    const rawProducts = Array.isArray(data) ? data : (data.products || [])
    
    console.log('🌐 Fetched products from Lambda/DynamoDB:', rawProducts.length, 'items')
    
    // Normalize product data to match the Product interface
    // DynamoDB might return different formats depending on how data was inserted
    const products = rawProducts.map((product: any) => {
      // Log each product for debugging
      console.log('📝 Raw product:', product)
      
      return {
        id: String(product.id || ''),
        name: String(product.name || ''),
        price: Number(product.price) || 0,
        image: product.image?.startsWith('http') 
          ? product.image 
          : `${S3_BUCKET}${product.image || ''}`,
        description: String(product.description || ''),
        // Handle sizes - could be array of strings or array of objects
        sizes: Array.isArray(product.sizes) 
          ? product.sizes.map((s: any) => typeof s === 'string' ? s : String(s))
          : [],
        isFlashSale: Boolean(product.isFlashSale),
        inventory: Number(product.inventory) || 0,
        flashSale: product.flashSale || undefined
      } as Product
    })
    
    console.log('✅ Normalized products:', products)
    
    return products
  } catch (error) {
    console.log('🔧 Using mock data - AWS API not available:', error)
    return mockProducts
  }
}

export const fetchProductById = async (id: string, authToken?: string): Promise<Product | null> => {
  // If no API URL configured, return mock data immediately
  if (!BROWSE_API) {
    console.log('🔧 Using mock data - no API configured')
    return mockProducts.find(product => product.id === id) || null
  }

  try {
    const headers = await getAuthHeaders(authToken)
    const response = await fetch(`${BROWSE_API}/products/${id}`, { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const rawProduct = await response.json()
    
    // Log raw response for debugging
    console.log('📦 Raw product from API:', rawProduct)
    
    // Normalize product data to match the Product interface
    const product: Product = {
      id: String(rawProduct.id || ''),
      name: String(rawProduct.name || ''),
      price: Number(rawProduct.price) || 0,
      image: rawProduct.image?.startsWith('http') 
        ? rawProduct.image 
        : `${S3_BUCKET}${rawProduct.image || ''}`,
      description: String(rawProduct.description || ''),
      // Handle sizes - could be array of strings or array of objects
      sizes: Array.isArray(rawProduct.sizes) 
        ? rawProduct.sizes.map((s: any) => typeof s === 'string' ? s : String(s))
        : [],
      isFlashSale: Boolean(rawProduct.isFlashSale),
      inventory: Number(rawProduct.inventory) || 0,
      flashSale: rawProduct.flashSale || undefined
    }
    
    console.log('🌐 Fetched product from Lambda/DynamoDB:', product.id, product.name)
    console.log('✅ Normalized product:', product)
    
    return product
  } catch (error) {
    console.log('🔧 Using mock data - AWS API not available:', error)
    return mockProducts.find(product => product.id === id) || null
  }
}

// Real-time inventory APIs (ECS service via API Gateway)
export const getLiveInventory = async (productId: string, authToken?: string): Promise<number> => {
  // If no API URL configured, return mock inventory immediately
  if (!INVENTORY_API) {
    const product = mockProducts.find(p => p.id === productId)
    return product?.inventory || 0
  }

  try {
    const headers = await getAuthHeaders(authToken)
    const response = await fetch(`${INVENTORY_API}/inventory/${productId}`, { headers })
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
export const reserveItem = async (productId: string, size: string, quantity: number = 1, authToken?: string) => {
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
    const headers = await getAuthHeaders(authToken)
    const response = await fetch(`${INVENTORY_API}/reserve`, {
      method: 'POST',
      headers,
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

// Flash sale utility functions
export const isFlashSaleActive = (flashSale?: FlashSale): boolean => {
  if (!flashSale) return false
  
  const now = new Date()
  const startTime = new Date(flashSale.startTime)
  const endTime = new Date(flashSale.endTime)
  
  return now >= startTime && now <= endTime && flashSale.soldQuantity < flashSale.maxQuantity
}

export const getFlashSaleStatus = (flashSale?: FlashSale) => {
  if (!flashSale) return { status: 'none' }
  
  const now = new Date()
  const startTime = new Date(flashSale.startTime)
  const endTime = new Date(flashSale.endTime)
  
  if (now < startTime) {
    return {
      status: 'upcoming',
      timeUntilStart: startTime.getTime() - now.getTime(),
      message: 'Flash sale starts soon!'
    }
  }
  
  if (now > endTime) {
    return {
      status: 'ended',
      message: 'Flash sale has ended'
    }
  }
  
  if (flashSale.soldQuantity >= flashSale.maxQuantity) {
    return {
      status: 'sold_out',
      message: 'Flash sale sold out!'
    }
  }
  
  return {
    status: 'active',
    timeUntilEnd: endTime.getTime() - now.getTime(),
    remaining: flashSale.maxQuantity - flashSale.soldQuantity,
    message: 'Flash sale active!'
  }
}

export const formatTimeRemaining = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

// Flash sale discount rate (20% off)
export const FLASH_SALE_DISCOUNT_RATE = 0.20

export const getCurrentPrice = (product: Product): number => {
  // If product is marked as flash sale, apply 20% discount
  if (product.isFlashSale) {
    return Math.round(product.price * (1 - FLASH_SALE_DISCOUNT_RATE))
  }
  return product.price
}

// Get the discount percentage for display
export const getDiscountPercentage = (): number => {
  return Math.round(FLASH_SALE_DISCOUNT_RATE * 100)
}
