import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanupOldAssessments() {
  // Calculate date 8 days ago
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 8)
  const cutoffISO = cutoffDate.toISOString()
  
  console.log('Deleting assessments created before:', cutoffISO)
  
  // First, get the IDs of old assessments
  const { data: oldAssessments, error: fetchError } = await supabase
    .from('assessments')
    .select('id, name, created_at')
    .lt('created_at', cutoffISO)
  
  if (fetchError) {
    console.error('Error fetching old assessments:', fetchError.message)
    return
  }
  
  console.log('Found', oldAssessments?.length || 0, 'assessments to delete:')
  oldAssessments?.forEach(a => console.log(' -', a.name, '(', a.created_at, ')'))
  
  if (!oldAssessments || oldAssessments.length === 0) {
    console.log('No old assessments to delete')
    return
  }
  
  const assessmentIds = oldAssessments.map(a => a.id)
  
  // Delete comparisons for these assessments
  const { error: compError } = await supabase
    .from('assessment_comparisons')
    .delete()
    .in('assessment_id', assessmentIds)
  
  if (compError) {
    console.error('Error deleting comparisons:', compError.message)
  } else {
    console.log('Deleted comparisons')
  }
  
  // Delete line items for these assessments
  const { error: lineItemError } = await supabase
    .from('assessment_line_items')
    .delete()
    .in('assessment_id', assessmentIds)
  
  if (lineItemError) {
    console.error('Error deleting line items:', lineItemError.message)
  } else {
    console.log('Deleted line items')
  }
  
  // Delete the assessments
  const { error: assessmentError } = await supabase
    .from('assessments')
    .delete()
    .in('id', assessmentIds)
  
  if (assessmentError) {
    console.error('Error deleting assessments:', assessmentError.message)
  } else {
    console.log('Deleted', assessmentIds.length, 'assessments')
  }
  
  console.log('Cleanup complete!')
}

cleanupOldAssessments()
