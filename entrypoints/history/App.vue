<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Search, Trash2, ExternalLink, Calendar, Globe, Download, AlertCircle, CheckCircle, Clock, Filter } from 'lucide-vue-next';
import type { HistoryRecord } from '../../types';

interface HistoryFilters {
  search: string;
  saveLocation: 'all' | 'local' | 'webdav';
  status: 'all' | 'success' | 'failed';
  dateRange: 'all' | 'today' | 'week' | 'month';
}

const records = ref<HistoryRecord[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const isLoading = ref(true);
const isDeleting = ref(false);
const filters = reactive<HistoryFilters>({
  search: '',
  saveLocation: 'all',
  status: 'all',
  dateRange: 'all'
});

const filteredRecords = computed(() => {
  return records.value.filter(record => {
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const matchesSearch = 
        record.title.toLowerCase().includes(searchTerm) ||
        record.url.toLowerCase().includes(searchTerm) ||
        record.domain.toLowerCase().includes(searchTerm);
      if (!matchesSearch) return false;
    }

    // Save location filter
    if (filters.saveLocation !== 'all' && record.saveLocation !== filters.saveLocation) {
      return false;
    }

    // Status filter
    if (filters.status !== 'all') {
      const isSuccess = record.success;
      if (filters.status === 'success' && !isSuccess) return false;
      if (filters.status === 'failed' && isSuccess) return false;
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = Date.now();
      const recordDate = record.timestamp;
      const dayMs = 24 * 60 * 60 * 1000;
      
      switch (filters.dateRange) {
        case 'today':
          if (now - recordDate > dayMs) return false;
          break;
        case 'week':
          if (now - recordDate > 7 * dayMs) return false;
          break;
        case 'month':
          if (now - recordDate > 30 * dayMs) return false;
          break;
      }
    }

    return true;
  });
});

const statistics = computed(() => {
  const total = records.value.length;
  const successful = records.value.filter(r => r.success).length;
  const failed = total - successful;
  
  return { total, successful, failed };
});

const hasSelection = computed(() => selectedIds.value.size > 0);
const isAllSelected = computed(() => 
  filteredRecords.value.length > 0 && 
  filteredRecords.value.every(record => selectedIds.value.has(record.id))
);

onMounted(async () => {
  await loadHistory();
});

async function loadHistory() {
  isLoading.value = true;
  try {
    const response = await browser.runtime.sendMessage({
      type: 'GET_HISTORY',
      data: {}
    });
    records.value = response || [];
  } catch (error) {
    console.error('Failed to load history:', error);
  } finally {
    isLoading.value = false;
  }
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value.clear();
  } else {
    filteredRecords.value.forEach(record => {
      selectedIds.value.add(record.id);
    });
  }
}

function toggleSelectRecord(recordId: string) {
  if (selectedIds.value.has(recordId)) {
    selectedIds.value.delete(recordId);
  } else {
    selectedIds.value.add(recordId);
  }
}

async function deleteSelected() {
  if (!hasSelection.value) return;

  const count = selectedIds.value.size;
  if (!confirm(`确定要删除选中的 ${count} 条记录吗？此操作不可撤销。`)) {
    return;
  }

  isDeleting.value = true;
  try {
    await browser.runtime.sendMessage({
      type: 'DELETE_HISTORY',
      data: Array.from(selectedIds.value)
    });
    
    // Remove deleted records from local state
    records.value = records.value.filter(record => !selectedIds.value.has(record.id));
    selectedIds.value.clear();
  } catch (error) {
    console.error('Failed to delete records:', error);
    alert('删除失败，请重试');
  } finally {
    isDeleting.value = false;
  }
}

async function deleteRecord(recordId: string) {
  if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) {
    return;
  }

  try {
    await browser.runtime.sendMessage({
      type: 'DELETE_HISTORY',
      data: [recordId]
    });
    
    records.value = records.value.filter(record => record.id !== recordId);
    selectedIds.value.delete(recordId);
  } catch (error) {
    console.error('Failed to delete record:', error);
    alert('删除失败，请重试');
  }
}

function openUrl(url: string) {
  window.open(url, '_blank');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function clearFilters() {
  filters.search = '';
  filters.saveLocation = 'all';
  filters.status = 'all';
  filters.dateRange = 'all';
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-4">
          <div class="flex items-center gap-3">
            <Clock class="w-8 h-8 text-blue-600" />
            <div>
              <h1 class="text-2xl font-bold text-gray-900">保存历史</h1>
              <p class="text-sm text-gray-600">管理您保存的网页内容</p>
            </div>
          </div>
          
          <!-- Statistics -->
          <div class="flex items-center gap-6 text-sm">
            <div class="flex items-center gap-1">
              <span class="text-gray-600">总计:</span>
              <span class="font-semibold">{{ statistics.total }}</span>
            </div>
            <div class="flex items-center gap-1">
              <CheckCircle class="w-4 h-4 text-green-600" />
              <span class="text-green-600">{{ statistics.successful }}</span>
            </div>
            <div class="flex items-center gap-1">
              <AlertCircle class="w-4 h-4 text-red-600" />
              <span class="text-red-600">{{ statistics.failed }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Filters -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex flex-wrap items-center gap-4">
          <!-- Search -->
          <div class="flex-1 min-w-64">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                v-model="filters.search"
                type="text"
                placeholder="搜索标题、URL 或域名..."
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10"
              />
            </div>
          </div>

          <!-- Save Location Filter -->
          <select 
            v-model="filters.saveLocation" 
            class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">所有位置</option>
            <option value="local">本地下载</option>
            <option value="webdav">WebDAV</option>
          </select>

          <!-- Status Filter -->
          <select 
            v-model="filters.status" 
            class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">所有状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>

          <!-- Date Range Filter -->
          <select 
            v-model="filters.dateRange" 
            class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">所有时间</option>
            <option value="today">今天</option>
            <option value="week">最近一周</option>
            <option value="month">最近一月</option>
          </select>

          <!-- Clear Filters -->
          <button 
            @click="clearFilters"
            class="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Filter class="w-4 h-4 inline mr-1" />
            清除筛选
          </button>
        </div>
      </div>

      <!-- Actions Bar -->
      <div v-if="!isLoading" class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="isAllSelected"
              @change="toggleSelectAll"
              class="w-4 h-4 rounded"
            />
            <span class="text-sm text-gray-700">
              {{ hasSelection ? `已选择 ${selectedIds.size} 项` : '全选' }}
            </span>
          </label>
        </div>

        <button
          v-if="hasSelection"
          @click="deleteSelected"
          :disabled="isDeleting"
          class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 class="w-4 h-4" />
          <span v-if="isDeleting">删除中...</span>
          <span v-else>删除选中 ({{ selectedIds.size }})</span>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3"></div>
        <p class="text-gray-600">加载历史记录中...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredRecords.length === 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <Clock class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {{ records.length === 0 ? '暂无保存记录' : '没有符合条件的记录' }}
        </h3>
        <p class="text-gray-600 mb-4">
          {{ records.length === 0 ? '开始使用 MD Save 保存您感兴趣的网页内容吧！' : '尝试调整筛选条件或清除筛选器' }}
        </p>
        <button 
          v-if="records.length > 0"
          @click="clearFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          清除筛选器
        </button>
      </div>

      <!-- Records Table -->
      <div v-else class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    @change="toggleSelectAll"
                    class="w-4 h-4 rounded"
                  />
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标题</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">域名</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">保存时间</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">位置</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">大小</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr 
                v-for="record in filteredRecords" 
                :key="record.id"
                class="hover:bg-gray-50 transition-colors"
                :class="{ 'bg-blue-50': selectedIds.has(record.id) }"
              >
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    :checked="selectedIds.has(record.id)"
                    @change="toggleSelectRecord(record.id)"
                    class="w-4 h-4 rounded"
                  />
                </td>
                <td class="px-4 py-3">
                  <div class="max-w-96">
                    <div class="font-medium text-gray-900 truncate">{{ record.title }}</div>
                    <div class="text-xs text-gray-500 truncate mt-1">{{ record.contentPreview }}</div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <Globe class="w-4 h-4 text-gray-400" />
                    <span class="text-sm text-gray-900">{{ record.domain }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <Calendar class="w-4 h-4 text-gray-400" />
                    <span class="text-sm text-gray-600">{{ formatDate(record.timestamp) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" :class="
                    record.saveLocation === 'local' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  ">
                    <Download v-if="record.saveLocation === 'local'" class="w-3 h-3" />
                    <Globe v-else class="w-3 h-3" />
                    {{ record.saveLocation === 'local' ? '本地' : 'WebDAV' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" :class="
                    record.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  ">
                    <CheckCircle v-if="record.success" class="w-3 h-3" />
                    <AlertCircle v-else class="w-3 h-3" />
                    {{ record.success ? '成功' : '失败' }}
                  </span>
                  <div v-if="!record.success && record.error" class="text-xs text-red-600 mt-1">
                    {{ record.error }}
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                  {{ formatFileSize(record.fileSize) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <button
                      @click="openUrl(record.url)"
                      class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="打开原网页"
                    >
                      <ExternalLink class="w-4 h-4" />
                    </button>
                    <button
                      @click="deleteRecord(record.id)"
                      class="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="删除记录"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>