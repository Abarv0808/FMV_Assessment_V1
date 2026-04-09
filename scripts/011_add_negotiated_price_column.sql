-- Add negotiated_price column to assessment_line_items table
ALTER TABLE assessment_line_items 
ADD COLUMN IF NOT EXISTS negotiated_price DECIMAL(15, 2);

-- Add comment for documentation
COMMENT ON COLUMN assessment_line_items.negotiated_price IS 'Negotiated price for the line item, entered by user after vendor negotiation';
