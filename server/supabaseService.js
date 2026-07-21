const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

/**
 * Fetch the latest N records from Supabase
 * @param {number} limit Number of records to fetch (default: TOP_N_COUNT = 20)
 * @returns {Promise<Array>} List of message objects
 */
async function fetchTopMessages(limit = config.TOP_N_COUNT) {
  try {
    const { data, error } = await supabase
      .from(config.SUPABASE_TABLE_NAME)
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ [Supabase] Error fetching top records:', error.message);
      // Fallback query without specific order column if 'id' ordering fails
      const { data: fallbackData } = await supabase
        .from(config.SUPABASE_TABLE_NAME)
        .select('*')
        .limit(limit);
      return fallbackData || [];
    }

    return data || [];
  } catch (err) {
    console.error('❌ [Supabase] Exception while fetching records:', err);
    return [];
  }
}

/**
 * Select a random message from the provided list of top messages
 * @param {Array} messages
 * @returns {Object} Selected message object
 */
function getRandomMessage(messages = []) {
  if (!messages || messages.length === 0) {
    return {
      id: 'default-0',
      Text: '暫無資料，等待輸入...',
      created_at: new Date().toISOString(),
    };
  }

  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

/**
 * Subscribe to realtime INSERT changes on Supabase table
 * @param {Function} onNewMessage Callback invoked when a new record is inserted
 */
function subscribeToNewMessages(onNewMessage) {
  try {
    const channel = supabase
      .channel('public:2026DAF:inserts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: config.SUPABASE_TABLE_NAME,
        },
        (payload) => {
          if (payload && payload.new) {
            console.log(
              `📥 [Supabase Realtime] New record inserted | ID: ${payload.new.id || 'N/A'} | Text: ${payload.new.Text}`
            );
            onNewMessage(payload.new);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 [Supabase Realtime] Channel status: ${status}`);
      });

    return channel;
  } catch (err) {
    console.error('❌ [Supabase Realtime] Failed to setup realtime subscription:', err);
    return null;
  }
}

module.exports = {
  supabase,
  fetchTopMessages,
  getRandomMessage,
  subscribeToNewMessages,
};
