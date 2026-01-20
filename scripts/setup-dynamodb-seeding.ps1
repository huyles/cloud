# FlashDrop AWS Infrastructure Setup Script
# This script seeds DynamoDB with products and uploads images to S3
# Run from project root with: pwsh -File scripts/setup-aws-data.ps1

param(
    [string]$Region = "us-east-1",
    [string]$StackName = "flashdrop"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "FlashDrop AWS Data Setup Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Get stack outputs
Write-Host "[1/4] Fetching CloudFormation stack outputs..." -ForegroundColor Yellow
$outputs = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs" --region $Region | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to get stack outputs. Make sure the stack '$StackName' exists in '$Region'." -ForegroundColor Red
    exit 1
}

# Extract values from outputs
$tableName = ($outputs | Where-Object { $_.OutputKey -eq "ProductsTableName" }).OutputValue
$imagesBucket = ($outputs | Where-Object { $_.OutputKey -eq "ProductImagesBucketName" }).OutputValue

Write-Host "  DynamoDB Table: $tableName" -ForegroundColor Green
Write-Host "  S3 Images Bucket: $imagesBucket" -ForegroundColor Green
Write-Host ""

# Seed DynamoDB with products
Write-Host "[2/4] Seeding DynamoDB with product data..." -ForegroundColor Yellow

$products = @(
    @{
        id = @{S = "1"}
        name = @{S = "Air Jordan 1 Retro High"}
        price = @{N = "170"}
        image = @{S = "/Giay-Nike-Air-Jordan-1-Retro-High-85-Black-White-BQ4422-001.jpg"}
        description = @{S = "The Air Jordan 1 Retro High remakes the classic sneaker, giving you a fresh take on what you know: crisp leather, bold color-blocking and the iconic Wings logo."}
        sizes = @{L = @(@{S="7"},@{S="7.5"},@{S="8"},@{S="8.5"},@{S="9"},@{S="9.5"},@{S="10"},@{S="10.5"},@{S="11"})}
        isFlashSale = @{BOOL = $true}
        inventory = @{N = "25"}
        category = @{S = "basketball"}
    },
    @{
        id = @{S = "2"}
        name = @{S = "Nike Dunk Low"}
        price = @{N = "100"}
        image = @{S = "/NIKE+DUNK+LOW+NN.avif"}
        description = @{S = "The Nike Dunk Low brings retro basketball style to the streets. With its classic colorways and premium materials, it's a timeless choice for sneaker enthusiasts."}
        sizes = @{L = @(@{S="7"},@{S="7.5"},@{S="8"},@{S="8.5"},@{S="9"},@{S="9.5"},@{S="10"},@{S="10.5"},@{S="11"})}
        isFlashSale = @{BOOL = $false}
        inventory = @{N = "50"}
        category = @{S = "lifestyle"}
    },
    @{
        id = @{S = "3"}
        name = @{S = "Adidas Yeezy Boost 350"}
        price = @{N = "220"}
        image = @{S = "/263577175_593534718561359_6151444724673571862_n.webp"}
        description = @{S = "The Yeezy Boost 350 features a Primeknit upper and Boost midsole for ultimate comfort and style. A must-have for any sneaker collection."}
        sizes = @{L = @(@{S="7"},@{S="7.5"},@{S="8"},@{S="8.5"},@{S="9"},@{S="9.5"},@{S="10"},@{S="10.5"},@{S="11"})}
        isFlashSale = @{BOOL = $true}
        inventory = @{N = "10"}
        category = @{S = "lifestyle"}
    },
    @{
        id = @{S = "4"}
        name = @{S = "New Balance 550"}
        price = @{N = "110"}
        image = @{S = "/giay-new-balance-nb-chinh-hang-bb550wt1-11.jpg"}
        description = @{S = "The New Balance 550 is a classic basketball silhouette reimagined for today. Clean lines and premium leather make it perfect for everyday wear."}
        sizes = @{L = @(@{S="7"},@{S="7.5"},@{S="8"},@{S="8.5"},@{S="9"},@{S="9.5"},@{S="10"},@{S="10.5"},@{S="11"})}
        isFlashSale = @{BOOL = $false}
        inventory = @{N = "30"}
        category = @{S = "basketball"}
    }
)

foreach ($product in $products) {
    $itemJson = $product | ConvertTo-Json -Depth 10 -Compress
    
    # Write to temp file to avoid escaping issues
    $tempFile = [System.IO.Path]::GetTempFileName()
    $itemJson | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline
    
    Write-Host "  Adding product: $($product.name.S)" -ForegroundColor Gray
    aws dynamodb put-item --table-name $tableName --item file://$tempFile --region $Region 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✓ Added successfully" -ForegroundColor Green
    } else {
        Write-Host "    ✗ Failed to add" -ForegroundColor Red
    }
    
    Remove-Item $tempFile -Force
}

Write-Host ""

# Upload images to S3
Write-Host "[3/4] Uploading product images to S3..." -ForegroundColor Yellow

$publicDir = Join-Path $PSScriptRoot ".." "public"
$imageFiles = @(
    "Giay-Nike-Air-Jordan-1-Retro-High-85-Black-White-BQ4422-001.jpg",
    "NIKE+DUNK+LOW+NN.avif",
    "263577175_593534718561359_6151444724673571862_n.webp",
    "giay-new-balance-nb-chinh-hang-bb550wt1-11.jpg"
)

foreach ($imageFile in $imageFiles) {
    $imagePath = Join-Path $publicDir $imageFile
    
    if (Test-Path $imagePath) {
        Write-Host "  Uploading: $imageFile" -ForegroundColor Gray
        
        # Determine content type
        $contentType = switch -Regex ($imageFile) {
            '\.jpg$' { "image/jpeg" }
            '\.jpeg$' { "image/jpeg" }
            '\.png$' { "image/png" }
            '\.webp$' { "image/webp" }
            '\.avif$' { "image/avif" }
            default { "application/octet-stream" }
        }
        
        aws s3 cp $imagePath "s3://$imagesBucket/$imageFile" --content-type $contentType --region $Region 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    ✓ Uploaded successfully" -ForegroundColor Green
        } else {
            Write-Host "    ✗ Failed to upload" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✗ Image not found: $imagePath" -ForegroundColor Red
    }
}

Write-Host ""

# Verify setup
Write-Host "[4/4] Verifying setup..." -ForegroundColor Yellow

$itemCount = aws dynamodb scan --table-name $tableName --select "COUNT" --region $Region --query "Count" --output text
Write-Host "  DynamoDB products: $itemCount items" -ForegroundColor Green

$s3Objects = aws s3 ls "s3://$imagesBucket/" --region $Region 2>&1
$s3Count = ($s3Objects | Measure-Object -Line).Lines
Write-Host "  S3 images: $s3Count files" -ForegroundColor Green

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your frontend is now connected to:" -ForegroundColor White
Write-Host "  - API Gateway: https://g4uffurrha.execute-api.us-east-1.amazonaws.com/dev" -ForegroundColor Gray
Write-Host "  - S3 Images: https://$imagesBucket.s3.$Region.amazonaws.com" -ForegroundColor Gray
Write-Host ""
Write-Host "Run 'bun run dev' to start the frontend!" -ForegroundColor Yellow
