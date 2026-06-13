<template>
  <div class="app-shell">
    <header class="hero-banner">
      <div class="hero-copy">
        <span class="hero-badge">Merchant Revenue Studio</span>
        <h1>商家收款数据统计管理</h1>
        <p>
          年度统计由有效月数据自动汇总，月度统计优先采用日数据回推。我们把录入与统计拆开，让台账维护、收入对比和趋势查看都更直观。
        </p>
      </div>

      <div class="hero-switcher">
        <button
          v-for="item in viewOptions"
          :key="item.value"
          type="button"
          class="view-chip"
          :class="{ active: activeView === item.value }"
          @click="switchView(item.value)"
        >
          <strong>{{ item.label }}</strong>
          <span>{{ item.desc }}</span>
        </button>

        <div class="user-panel" v-loading="usersLoading">
          <div class="user-panel-heading">
            <span>当前用户</span>
            <strong>{{ currentUserName }}</strong>
          </div>
          <div class="user-panel-controls">
            <el-select
              v-model="currentUserId"
              class="full-control"
              placeholder="选择用户"
              @change="handleUserChange"
            >
              <el-option
                v-for="item in users"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <el-button @click="openUserDialog">新增用户</el-button>
          </div>
        </div>
      </div>
    </header>

    <main class="workspace">
      <section v-if="activeView === 'analytics'" v-loading="analyticsLoading" class="analytics-page">
        <section class="panel filter-panel">
          <div class="section-heading">
            <div>
              <span class="section-kicker">Analytics</span>
              <h2>统计分析</h2>
              <p>{{ trendScopeText }}</p>
            </div>
            <div class="heading-actions">
              <el-button :loading="analyticsLoading" @click="refreshAnalytics">刷新看板</el-button>
            </div>
          </div>

          <div class="toolbar-grid">
            <div class="toolbar-group">
              <label>统计粒度</label>
              <el-segmented
                v-model="analytics.dimension"
                :options="analyticsGranularityOptions"
                @change="handleAnalyticsDimensionChange"
              />
            </div>

            <div class="toolbar-group">
              <label>统计周期</label>
              <el-select
                v-if="analytics.dimension === 'year'"
                v-model="analytics.years"
                multiple
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="2"
                class="full-control"
                placeholder="选择对比年份"
                @change="handleYearSelectionChange"
              >
                <el-option
                  v-for="item in analyticsYearOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-date-picker
                v-else
                v-model="analytics.period"
                :type="analyticsPicker.type"
                :format="analyticsPicker.format"
                :value-format="analyticsPicker.valueFormat"
                :placeholder="analyticsPicker.placeholder"
                :editable="false"
                popper-class="mobile-picker-popper"
                class="full-control"
                @change="refreshAnalytics"
              />
            </div>

            <div class="toolbar-group">
              <label>图表维度</label>
              <el-segmented v-model="analytics.metric" :options="metricOptions" @change="renderChart" />
            </div>
          </div>

          <div class="compare-ribbon" :class="{ 'year-ribbon': analytics.dimension === 'year' }">
            <template v-if="analytics.dimension === 'year'">
              <article
                v-for="item in yearCompareCards"
                :key="item.period"
                class="compare-card"
                :class="{ 'compare-card-alt': item.period === getCurrentPeriod('year') }"
              >
                <span>{{ formatPeriodLabel('year', item.period) }}</span>
                <strong>{{ money(item.summary.total.amount) }}</strong>
                <small>{{ item.summary.total.people }} 人 / 微信 {{ money(item.summary.wechat.amount) }} / 支付宝 {{ money(item.summary.alipay.amount) }} / 现金 {{ money(item.summary.cash.amount) }}</small>
              </article>
            </template>

            <template v-else>
            <article class="compare-card">
              <span>当前周期</span>
              <strong>{{ selectedPeriodLabel }}</strong>
              <small>{{ money(summary.total.amount) }} / {{ summary.total.people }} 人</small>
            </article>

            <article class="compare-card compare-card-alt">
              <span>{{ compareAnchorLabel }}</span>
              <strong>{{ comparePeriodLabel }}</strong>
              <small>{{ money(compareSummary.total.amount) }} / {{ compareSummary.total.people }} 人</small>
            </article>

            <article class="compare-card compare-card-delta">
              <span>收入差值</span>
              <strong :class="deltaClass(comparisonDelta.amount)">
                {{ formatMoneyDelta(comparisonDelta.amount) }}
              </strong>
              <small>{{ compareRuleText }}</small>
            </article>

            <article class="compare-card compare-card-delta">
              <span>人数差值</span>
              <strong :class="deltaClass(comparisonDelta.people)">
                {{ formatPeopleDelta(comparisonDelta.people) }}
              </strong>
              <small>
                {{
                  comparisonDelta.people === 0
                    ? '人数持平'
                    : comparisonDelta.people > 0
                      ? '人数更高'
                      : '人数更低'
                }}
              </small>
            </article>
            </template>
          </div>
        </section>

        <section class="analytics-grid">
          <article class="kpi-card card-wechat">
            <span>微信收款</span>
            <strong>{{ money(summary.wechat.amount) }}</strong>
            <small>{{ summary.wechat.people }} 人</small>
          </article>

          <article class="kpi-card card-alipay">
            <span>支付宝收款</span>
            <strong>{{ money(summary.alipay.amount) }}</strong>
            <small>{{ summary.alipay.people }} 人</small>
          </article>

          <article class="kpi-card card-cash">
            <span>现金收款</span>
            <strong>{{ money(summary.cash.amount) }}</strong>
            <small>{{ summary.cash.people }} 人</small>
          </article>

          <article class="kpi-card card-total">
            <span>全渠道合计</span>
            <strong>{{ money(summary.total.amount) }}</strong>
            <small>客单价 {{ averagePerPerson }}</small>
          </article>

          <section class="panel chart-panel">
            <div class="section-heading compact">
              <div>
                <span class="section-kicker">Trend</span>
                <h2>{{ chartTitle }}</h2>
                <p>按当前统计粒度展示微信、支付宝、现金与合计走势。</p>
              </div>
            </div>
            <div ref="chartRef" class="chart-box"></div>
          </section>

          <section class="panel insight-panel">
            <div class="section-heading compact">
              <div>
                <span class="section-kicker">Mix</span>
                <h2>渠道占比</h2>
                <p>当前周期下的金额与人数贡献分布。</p>
              </div>
            </div>

            <div class="mix-group">
              <div v-for="item in shareRows" :key="item.key" class="mix-row">
                <div class="mix-label">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.value }}</span>
                </div>
                <div class="mix-track">
                  <div class="mix-fill" :style="{ width: `${item.percent}%`, background: item.color }"></div>
                </div>
                <em>{{ item.percent }}%</em>
              </div>
            </div>
          </section>

          <section class="panel detail-panel">
            <div class="section-heading compact">
              <div>
                <span class="section-kicker">Periods</span>
                <h2>周期明细</h2>
                <p>{{ detailHint }}</p>
              </div>
            </div>

            <el-empty v-if="!analyticsLoading && detailRows.length === 0" description="暂无可展示的趋势数据" />
            <div v-else class="detail-list">
              <article v-for="item in detailRows" :key="item.period" class="detail-item">
                <div class="detail-top">
                  <strong>{{ formatPeriodLabel(analytics.dimension, item.period) }}</strong>
                  <span>总收入 {{ money(item.summary.total.amount) }}</span>
                </div>
                <div class="detail-values">
                  <span>微信 {{ money(item.summary.wechat.amount) }}</span>
                  <span>支付宝 {{ money(item.summary.alipay.amount) }}</span>
                  <span>现金 {{ money(item.summary.cash.amount) }}</span>
                  <span>{{ item.summary.total.people }} 人</span>
                </div>
              </article>
            </div>
          </section>
        </section>
      </section>

      <section v-else class="entry-page">
        <section class="panel ledger-panel" v-loading="recordsLoading">
          <div class="section-heading ledger-heading">
            <div>
              <span class="section-kicker">Records</span>
              <h2>录入台账</h2>
              <p>月台账按年份筛选，日台账按月份筛选。新增与编辑记录在弹窗中完成，列表始终作为默认工作区。</p>
            </div>
            <div class="heading-actions ledger-actions">
              <el-button type="primary" @click="openCreateDialog">新增记录</el-button>
              <el-button tag="a" href="/receipt-import-template.csv" download="收款导入模板.csv">下载模板</el-button>
              <el-button :loading="importing" @click="triggerImport">Excel导入</el-button>
              <el-button :loading="recordsLoading" @click="refreshRecords">刷新列表</el-button>
              <input
                ref="importInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                class="hidden-file-input"
                @change="handleImportFile"
              />
            </div>
          </div>

          <div class="toolbar-grid compact-grid ledger-toolbar">
            <div class="toolbar-group">
              <label>筛选粒度</label>
              <el-segmented
                v-model="recordFilters.granularity"
                :options="entryGranularityOptions"
                @change="handleRecordGranularityChange"
              />
            </div>

            <div class="toolbar-group">
              <label>{{ recordFilterPeriodLabel }}</label>
              <el-date-picker
                v-model="recordFilters.period"
                :type="recordFilterPicker.type"
                :format="recordFilterPicker.format"
                :value-format="recordFilterPicker.valueFormat"
                :placeholder="recordFilterPicker.placeholder"
                :editable="false"
                popper-class="mobile-picker-popper"
                clearable
                class="full-control"
                @change="refreshRecords"
              />
            </div>

            <div class="toolbar-group">
              <label>渠道筛选</label>
              <el-segmented
                v-model="recordFilters.channel"
                :options="channelFilterOptions"
                @change="refreshRecords"
              />
            </div>

            <div class="toolbar-group">
              <label>导入渠道</label>
              <el-segmented v-model="importChannel" :options="channelOptions" />
            </div>
          </div>

          <div class="ledger-summary">
            <div>
              <strong>{{ records.length }}</strong>
              <span>条记录</span>
            </div>
            <div>
              <strong>{{ money(recordTotalAmount) }}</strong>
              <span>筛选后金额</span>
            </div>
            <div>
              <strong>{{ recordTotalPeople }}</strong>
              <span>筛选后人数</span>
            </div>
          </div>

          <el-empty v-if="!recordsLoading && records.length === 0" description="当前筛选条件下暂无数据" />
          <div v-else class="record-list">
            <article v-for="item in pagedRecords" :key="item.id" class="record-card">
              <div class="record-meta">
                <div class="record-badges">
                  <el-tag round>{{ granularityText(item.granularity) }}</el-tag>
                  <el-tag round :type="item.channel === 'wechat' ? 'success' : item.channel === 'alipay' ? 'primary' : 'warning'">
                    {{ channelText(item.channel) }}
                  </el-tag>
                  <el-tag v-if="item.isOverridden" round type="warning">已被日汇总覆盖</el-tag>
                </div>
                <strong>{{ formatPeriodLabel(item.granularity, item.period) }}</strong>
                <span>创建于 {{ formatCreatedAt(item.createdAt) }}</span>
              </div>

              <div class="record-values">
                <div :class="{ 'record-value-secondary': item.isOverridden }">
                  <label>{{ item.isOverridden ? '当前生效金额' : '收款金额' }}</label>
                  <strong>{{ money(item.isOverridden ? item.effectiveAmount : item.amount) }}</strong>
                  <small v-if="item.isOverridden">月录入值 {{ money(item.amount) }}</small>
                </div>
                <div :class="{ 'record-value-secondary': item.isOverridden }">
                  <label>{{ item.isOverridden ? '当前生效人数' : '收款人数' }}</label>
                  <strong>{{ item.isOverridden ? item.effectivePeople : item.people }} 人</strong>
                  <small v-if="item.isOverridden">月录入值 {{ item.people }} 人</small>
                </div>
              </div>

              <div class="record-actions">
                <el-button text type="primary" @click="startEdit(item)">编辑</el-button>
                <el-popconfirm
                  title="确认删除这条记录吗？"
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  @confirm="deleteItem(item.id)"
                >
                  <template #reference>
                    <el-button text type="danger">删除</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </article>
          </div>

          <div v-if="records.length > pagination.pageSize" class="pagination-wrap">
            <el-pagination
              v-model:current-page="pagination.currentPage"
              v-model:page-size="pagination.pageSize"
              background
              layout="prev, pager, next"
              :total="records.length"
              :pager-count="5"
            />
          </div>
        </section>

        <el-dialog
          v-model="entryDialogVisible"
          :title="entryDialogTitle"
          width="min(92vw, 640px)"
          class="entry-dialog"
          destroy-on-close
          :close-on-click-modal="!saving"
          :close-on-press-escape="!saving"
          @closed="handleEntryDialogClosed"
        >
          <p class="dialog-helper">仅支持按月、按日录入。年数据自动汇总，月数据若存在日记录则由日汇总接管。</p>

          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="entry-form">
            <el-form-item label="录入粒度" prop="granularity">
              <el-segmented
                v-model="form.granularity"
                :options="entryGranularityOptions"
                @change="handleFormGranularityChange"
              />
            </el-form-item>

            <div class="entry-form-grid">
              <el-form-item label="收款渠道" prop="channel">
                <el-segmented v-model="form.channel" :options="channelOptions" />
              </el-form-item>

              <el-form-item label="录入周期" prop="period">
                <el-date-picker
                  v-model="form.period"
                  :type="formPicker.type"
                  :format="formPicker.format"
                  :value-format="formPicker.valueFormat"
                  :placeholder="formPicker.placeholder"
                  :editable="false"
                  popper-class="mobile-picker-popper"
                  class="full-control"
                />
              </el-form-item>

              <el-form-item label="收款金额" prop="amount">
                <el-input v-model="form.amount" inputmode="decimal" placeholder="请输入收款金额">
                  <template #prefix>¥</template>
                </el-input>
              </el-form-item>

              <el-form-item label="收款人数" prop="people">
                <el-input v-model="form.people" inputmode="numeric" placeholder="请输入收款人数" />
              </el-form-item>
            </div>
          </el-form>

          <template #footer>
            <div class="dialog-footer-actions">
              <el-button :disabled="saving" @click="closeEntryDialog">取消</el-button>
              <el-button type="primary" :loading="saving" @click="submitForm">
                {{ editingId ? '保存修改' : '写入记录' }}
              </el-button>
            </div>
          </template>
        </el-dialog>
      </section>
    </main>

    <el-dialog
      v-model="userDialogVisible"
      title="新增用户"
      width="min(92vw, 420px)"
      class="user-dialog"
      :close-on-click-modal="!userSaving"
      :close-on-press-escape="!userSaving"
    >
      <el-form label-position="top" class="user-form" @submit.prevent>
        <el-form-item label="用户名称">
          <el-input v-model="userForm.name" maxlength="24" placeholder="请输入用户名称" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer-actions">
          <el-button :disabled="userSaving" @click="closeUserDialog">取消</el-button>
          <el-button type="primary" :loading="userSaving" @click="createUser">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';
import { ElMessage } from 'element-plus';
import { receiptApi, setActiveUserId, userApi } from './api';

const USER_STORAGE_KEY = 'merchant-receipt-current-user-id';
const DEFAULT_USER_ID = 'admin';

const viewOptions = [
  { value: 'analytics', label: '统计分析', desc: '收入对比与趋势走势' },
  { value: 'entry', label: '数据录入', desc: '按月、按日维护台账' }
];

const analyticsGranularityOptions = [
  { label: '按年', value: 'year' },
  { label: '按月', value: 'month' },
  { label: '按日', value: 'day' }
];

const entryGranularityOptions = [
  { label: '按月', value: 'month' },
  { label: '按日', value: 'day' }
];

const channelOptions = [
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '现金', value: 'cash' }
];

const channelFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '现金', value: 'cash' }
];

const metricOptions = [
  { label: '收款金额', value: 'amount' },
  { label: '收款人数', value: 'people' }
];

const pickerMap = {
  year: { type: 'year', format: 'YYYY', valueFormat: 'YYYY', placeholder: '选择年份' },
  month: { type: 'month', format: 'YYYY-MM', valueFormat: 'YYYY-MM', placeholder: '选择月份' },
  day: { type: 'date', format: 'YYYY-MM-DD', valueFormat: 'YYYY-MM-DD', placeholder: '选择日期' }
};

function createSummaryState() {
  return {
    wechat: { amount: 0, people: 0 },
    alipay: { amount: 0, people: 0 },
    cash: { amount: 0, people: 0 },
    total: { amount: 0, people: 0 }
  };
}

function defaultCompareYears() {
  const currentYear = new Date().getFullYear();
  return [String(currentYear - 1), String(currentYear)];
}

const activeView = ref('analytics');
const formRef = ref();
const chartRef = ref();
const importInput = ref();
const storedUserId = localStorage.getItem(USER_STORAGE_KEY) || DEFAULT_USER_ID;
const currentUserId = ref(storedUserId);
const users = ref([]);
const usersLoading = ref(false);
const userSaving = ref(false);
const userDialogVisible = ref(false);
const userForm = reactive({
  name: ''
});

setActiveUserId(storedUserId);

const analytics = reactive({
  dimension: 'year',
  period: getCurrentPeriod('year'),
  years: defaultCompareYears(),
  metric: 'amount'
});

const form = reactive({
  channel: 'wechat',
  granularity: 'day',
  period: getCurrentPeriod('day'),
  amount: '',
  people: ''
});

const recordFilters = reactive({
  granularity: 'day',
  period: getRecordFilterDefault('day'),
  channel: 'all'
});

const summary = reactive(createSummaryState());
const compareSummary = reactive(createSummaryState());

const trendRows = ref([]);
const yearCompareSummaries = ref([]);
const records = ref([]);
const analyticsLoading = ref(false);
const recordsLoading = ref(false);
const saving = ref(false);
const importing = ref(false);
const editingId = ref('');
const entryDialogVisible = ref(false);
const importChannel = ref('wechat');
const pagination = reactive({
  currentPage: 1,
  pageSize: 6
});

let chartInstance = null;

function pad(value) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getCurrentPeriod(granularity) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = `${year}-${pad(now.getMonth() + 1)}`;
  const day = `${month}-${pad(now.getDate())}`;

  if (granularity === 'year') return year;
  if (granularity === 'month') return month;
  return day;
}

function getRecordFilterDefault(granularity) {
  if (granularity === 'month') return getCurrentPeriod('year');
  return getCurrentPeriod('month');
}

function getComparablePeriod(granularity, period) {
  const currentYear = new Date().getFullYear();
  if (!period) return getCurrentPeriod(granularity);

  if (granularity === 'year') {
    const candidate = String(currentYear);
    return candidate === period ? String(currentYear - 1) : candidate;
  }

  if (granularity === 'month') {
    const monthPart = period.slice(5, 7);
    const candidate = `${currentYear}-${monthPart}`;
    return candidate === period ? `${currentYear - 1}-${monthPart}` : candidate;
  }

  const month = Number(period.slice(5, 7));
  const day = Number(period.slice(8, 10));
  const buildDay = (year) => `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
  const candidate = buildDay(currentYear);
  return candidate === period ? buildDay(currentYear - 1) : candidate;
}

function getParentPeriod(granularity, period) {
  if (!period) return '';
  if (granularity === 'month') return period.slice(0, 4);
  if (granularity === 'day') return period.slice(0, 7);
  return '';
}

function pickerConfig(granularity) {
  return pickerMap[granularity];
}

function granularityText(granularity) {
  if (granularity === 'month') return '月度';
  if (granularity === 'day') return '日度';
  return '年度';
}

function channelText(channel) {
  if (channel === 'wechat') return '微信';
  if (channel === 'alipay') return '支付宝';
  return '现金';
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function moneyPlain(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPeriodLabel(granularity, period) {
  if (!period) return '--';
  if (granularity === 'year') return `${period} 年`;
  if (granularity === 'month') {
    const [year, month] = period.split('-');
    return `${year} 年 ${month} 月`;
  }
  const [year, month, day] = period.split('-');
  return `${year} 年 ${month} 月 ${day} 日`;
}

function formatCreatedAt(value) {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function assignSummary(target, nextSummary) {
  for (const key of ['wechat', 'alipay', 'cash', 'total']) {
    target[key].amount = Number(nextSummary?.[key]?.amount || 0);
    target[key].people = Number(nextSummary?.[key]?.people || 0);
  }
}

function deltaClass(value) {
  if (value > 0) return 'delta-positive';
  if (value < 0) return 'delta-negative';
  return 'delta-neutral';
}

function formatMoneyDelta(value) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}¥${moneyPlain(Math.abs(value))}`;
}

function formatPeopleDelta(value) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${Math.abs(value)} 人`;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

const analyticsPicker = computed(() => pickerConfig(analytics.dimension));
const formPicker = computed(() => pickerConfig(form.granularity));
const recordFilterPickerGranularity = computed(() => (recordFilters.granularity === 'month' ? 'year' : 'month'));
const recordFilterPicker = computed(() => pickerConfig(recordFilterPickerGranularity.value));

const comparePeriod = computed(() => getComparablePeriod(analytics.dimension, analytics.period));
const selectedPeriodLabel = computed(() => formatPeriodLabel(analytics.dimension, analytics.period));
const comparePeriodLabel = computed(() => formatPeriodLabel(analytics.dimension, comparePeriod.value));

const compareAnchorLabel = computed(() => {
  const currentYear = String(new Date().getFullYear());
  return comparePeriod.value.startsWith(currentYear) ? `${currentYear} 同口径` : '上一年同口径';
});

const compareRuleText = computed(() => {
  const currentYear = String(new Date().getFullYear());
  return comparePeriod.value.startsWith(currentYear)
    ? `当前所选周期与 ${currentYear} 年同口径对比`
    : '当前已在今年口径内，自动切换为上一年同口径';
});

const comparisonDelta = computed(() => ({
  amount: Number(summary.total.amount) - Number(compareSummary.total.amount),
  people: Number(summary.total.people) - Number(compareSummary.total.people)
}));

const averagePerPerson = computed(() => {
  if (!summary.total.people) return '¥0.00 / 人';
  return `${money(summary.total.amount / summary.total.people)} / 人`;
});

const trendScopeText = computed(() => {
  if (analytics.dimension === 'year') {
    return `当前查看 ${selectedPeriodLabel.value}，年度结果由该年的有效月数据自动汇总。`;
  }
  if (analytics.dimension === 'month') {
    return `当前查看 ${selectedPeriodLabel.value}，若当月存在日数据，则月统计自动使用日汇总。`;
  }
  return `当前查看 ${selectedPeriodLabel.value}，下方折线图展示该月份内的每日走势。`;
});

const chartTitle = computed(() => (analytics.metric === 'amount' ? '渠道收入折线图' : '渠道人数折线图'));

const detailHint = computed(() => {
  if (analytics.dimension === 'year') return '按年份查看各渠道的年度变化。';
  if (analytics.dimension === 'month') return `${analytics.period.slice(0, 4)} 年的月度变化明细。`;
  return `${analytics.period.slice(0, 7)} 的每日变化明细。`;
});

const detailRows = computed(() => [...visibleTrendRows.value].reverse());

const analyticsYearOptions = computed(() => {
  const years = new Set([...defaultCompareYears(), ...analytics.years, ...trendRows.value.map((item) => item.period)]);
  return [...years]
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))
    .map((year) => ({ label: formatPeriodLabel('year', year), value: year }));
});

const selectedYearSet = computed(() => new Set(analytics.years));

const visibleTrendRows = computed(() => {
  if (analytics.dimension !== 'year') return trendRows.value;
  return trendRows.value.filter((item) => selectedYearSet.value.has(item.period));
});

const yearCompareCards = computed(() =>
  [...yearCompareSummaries.value]
    .sort((left, right) => right.period.localeCompare(left.period))
);

const shareRows = computed(() => {
  const totalAmount = Number(summary.total.amount || 0);
  const totalPeople = Number(summary.total.people || 0);

  return [
    {
      key: 'wechat-amount',
      label: '微信金额占比',
      value: money(summary.wechat.amount),
      percent: totalAmount ? Math.round((summary.wechat.amount / totalAmount) * 100) : 0,
      color: 'linear-gradient(90deg, #0ea5a4, #22c55e)'
    },
    {
      key: 'alipay-amount',
      label: '支付宝金额占比',
      value: money(summary.alipay.amount),
      percent: totalAmount ? Math.round((summary.alipay.amount / totalAmount) * 100) : 0,
      color: 'linear-gradient(90deg, #38bdf8, #2563eb)'
    },
    {
      key: 'cash-amount',
      label: '现金金额占比',
      value: money(summary.cash.amount),
      percent: totalAmount ? Math.round((summary.cash.amount / totalAmount) * 100) : 0,
      color: 'linear-gradient(90deg, #f97316, #facc15)'
    },
    {
      key: 'wechat-people',
      label: '微信人数占比',
      value: `${summary.wechat.people} 人`,
      percent: totalPeople ? Math.round((summary.wechat.people / totalPeople) * 100) : 0,
      color: 'linear-gradient(90deg, #f59e0b, #fb7185)'
    },
    {
      key: 'alipay-people',
      label: '支付宝人数占比',
      value: `${summary.alipay.people} 人`,
      percent: totalPeople ? Math.round((summary.alipay.people / totalPeople) * 100) : 0,
      color: 'linear-gradient(90deg, #8b5cf6, #ec4899)'
    },
    {
      key: 'cash-people',
      label: '现金人数占比',
      value: `${summary.cash.people} 人`,
      percent: totalPeople ? Math.round((summary.cash.people / totalPeople) * 100) : 0,
      color: 'linear-gradient(90deg, #ef4444, #f59e0b)'
    }
  ];
});

const recordFilterPeriodLabel = computed(() => (recordFilters.granularity === 'month' ? '筛选年份' : '筛选月份'));
const recordTotalAmount = computed(() => records.value.reduce((total, item) => total + Number(item.amount || 0), 0));
const recordTotalPeople = computed(() => records.value.reduce((total, item) => total + Number(item.people || 0), 0));
const entryDialogTitle = computed(() => (editingId.value ? '编辑收款记录' : '新增收款记录'));
const currentUserName = computed(() => users.value.find((item) => item.id === currentUserId.value)?.name || '管理员');

const pagedRecords = computed(() => {
  const start = (pagination.currentPage - 1) * pagination.pageSize;
  return records.value.slice(start, start + pagination.pageSize);
});

const positiveAmount = (rule, value, callback) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) callback(new Error('请输入大于 0 的金额'));
  else callback();
};

const positiveInteger = (rule, value, callback) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) callback(new Error('请输入正整数人数'));
  else callback();
};

const rules = {
  granularity: [{ required: true, message: '请选择录入粒度', trigger: 'change' }],
  channel: [{ required: true, message: '请选择收款渠道', trigger: 'change' }],
  period: [{ required: true, message: '请选择录入周期', trigger: 'change' }],
  amount: [{ required: true, validator: positiveAmount, trigger: 'blur' }],
  people: [{ required: true, validator: positiveInteger, trigger: 'blur' }]
};

function switchView(view) {
  activeView.value = view;
}

async function loadUsers() {
  usersLoading.value = true;

  try {
    const list = await userApi.list();
    users.value = Array.isArray(list) ? list : [];

    if (!users.value.some((item) => item.id === currentUserId.value)) {
      currentUserId.value = users.value[0]?.id || DEFAULT_USER_ID;
      setActiveUserId(currentUserId.value);
      localStorage.setItem(USER_STORAGE_KEY, currentUserId.value);
    }
  } catch (error) {
    users.value = [{ id: DEFAULT_USER_ID, name: '管理员', role: 'admin' }];
    currentUserId.value = DEFAULT_USER_ID;
    setActiveUserId(DEFAULT_USER_ID);
    localStorage.setItem(USER_STORAGE_KEY, DEFAULT_USER_ID);
    ElMessage.error(error.message || '加载用户失败');
  } finally {
    usersLoading.value = false;
  }
}

async function handleUserChange(userId) {
  currentUserId.value = userId || DEFAULT_USER_ID;
  setActiveUserId(currentUserId.value);
  localStorage.setItem(USER_STORAGE_KEY, currentUserId.value);
  resetForm(getCreateFormDefaults());
  await Promise.all([refreshAnalytics(), refreshRecords()]);
}

function openUserDialog() {
  userForm.name = '';
  userDialogVisible.value = true;
}

function closeUserDialog() {
  userDialogVisible.value = false;
}

async function createUser() {
  const name = userForm.name.trim();
  if (!name) {
    ElMessage.warning('请输入用户名称');
    return;
  }

  userSaving.value = true;
  try {
    const user = await userApi.create({ name });
    await loadUsers();
    await handleUserChange(user.id);
    closeUserDialog();
    ElMessage.success('新增用户成功');
  } catch (error) {
    ElMessage.error(error.message || '新增用户失败');
  } finally {
    userSaving.value = false;
  }
}

function getCreateFormDefaults() {
  const granularity = recordFilters.granularity || 'day';
  const channel = recordFilters.channel === 'all' ? importChannel.value : recordFilters.channel;
  return {
    channel,
    granularity,
    period: getCurrentPeriod(granularity)
  };
}

function resetForm(preserveSelection = null) {
  const nextGranularity = preserveSelection?.granularity || form.granularity || 'day';
  editingId.value = '';

  Object.assign(form, {
    channel: preserveSelection?.channel || form.channel || 'wechat',
    granularity: nextGranularity,
    period: preserveSelection?.period || form.period || getCurrentPeriod(nextGranularity),
    amount: '',
    people: ''
  });

  nextTick(() => formRef.value?.clearValidate());
}

function openCreateDialog() {
  resetForm(getCreateFormDefaults());
  entryDialogVisible.value = true;
}

function closeEntryDialog() {
  entryDialogVisible.value = false;
}

function handleEntryDialogClosed() {
  if (!saving.value) resetForm(getCreateFormDefaults());
}

function handleAnalyticsDimensionChange(nextValue) {
  analytics.period = getCurrentPeriod(nextValue);
  if (nextValue === 'year' && analytics.years.length === 0) {
    analytics.years = defaultCompareYears();
  }
  refreshAnalytics();
}

function handleYearSelectionChange() {
  if (analytics.years.length === 0) {
    analytics.years = defaultCompareYears();
  }
  analytics.period = analytics.years[analytics.years.length - 1] || getCurrentPeriod('year');
  refreshAnalytics();
}

function handleFormGranularityChange(nextValue) {
  form.period = getCurrentPeriod(nextValue);
}

function handleRecordGranularityChange(nextValue) {
  recordFilters.period = getRecordFilterDefault(nextValue);
  refreshRecords();
}

async function refreshAnalytics() {
  analyticsLoading.value = true;

  try {
    if (analytics.dimension === 'year') {
      const years = analytics.years.length ? analytics.years : defaultCompareYears();
      const [trendData, ...summaryResults] = await Promise.all([
        receiptApi.trend({ dimension: 'year' }),
        ...years.map((year) => receiptApi.summary({ dimension: 'year', period: year }))
      ]);

      const summaries = years.map((year, index) => ({
        period: year,
        summary: summaryResults[index]?.summary || createSummaryState()
      }));

      yearCompareSummaries.value = summaries;
      trendRows.value = Array.isArray(trendData) ? trendData : [];

      const currentYearSummary = summaries.find((item) => item.period === getCurrentPeriod('year')) || summaries[summaries.length - 1];
      const compareYearSummary = summaries.find((item) => item.period === String(Number(currentYearSummary?.period || 0) - 1)) || summaries[0];

      assignSummary(summary, currentYearSummary?.summary);
      assignSummary(compareSummary, compareYearSummary?.summary);

      await nextTick();
      await waitForPaint();
      if (activeView.value === 'analytics') renderChart();
      return;
    }

    const [summaryData, compareData, trendData] = await Promise.all([
      receiptApi.summary({
        dimension: analytics.dimension,
        period: analytics.period
      }),
      receiptApi.summary({
        dimension: analytics.dimension,
        period: comparePeriod.value
      }),
      receiptApi.trend({
        dimension: analytics.dimension,
        parentPeriod: getParentPeriod(analytics.dimension, analytics.period) || undefined
      })
    ]);

    assignSummary(summary, summaryData.summary);
    assignSummary(compareSummary, compareData.summary);
    trendRows.value = Array.isArray(trendData) ? trendData : [];

    await nextTick();
    await waitForPaint();
    if (activeView.value === 'analytics') renderChart();
  } catch (error) {
    ElMessage.error(error.message || '刷新统计失败');
  } finally {
    analyticsLoading.value = false;
  }
}

async function refreshRecords() {
  recordsLoading.value = true;

  try {
    const list = await receiptApi.list({
      granularity: recordFilters.granularity,
      parentPeriod: recordFilters.period || undefined,
      channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
    });

    records.value = Array.isArray(list) ? list : [];
    pagination.currentPage = 1;
  } catch (error) {
    ElMessage.error(error.message || '刷新台账失败');
  } finally {
    recordsLoading.value = false;
  }
}

function triggerImport() {
  importInput.value?.click();
}

function normalizeImportPeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) return `${parsed.y}-${pad(parsed.m)}`;
  }

  const text = String(value ?? '').trim();
  const matched = text.match(/^(\d{4})[-/.年\s]*(\d{1,2})/);
  if (!matched) return '';

  const month = Number(matched[2]);
  if (month < 1 || month > 12) return '';
  return `${matched[1]}-${pad(month)}`;
}

function cellText(value) {
  return String(value ?? '').trim();
}

function parseImportRows(sheetRows) {
  const firstRow = sheetRows[0] || [];
  const headers = firstRow.map(cellText);
  const monthIndex = headers.findIndex((header) => /^(月份|月|month|period)$/i.test(header));
  const amountIndex = headers.findIndex((header) => /^(金额|收款金额|amount)$/i.test(header));
  const peopleIndex = headers.findIndex((header) => /^(人数|收款人数|people|count)$/i.test(header));
  const hasHeader = monthIndex !== -1 || amountIndex !== -1 || peopleIndex !== -1;
  const indexes = {
    month: monthIndex === -1 ? 0 : monthIndex,
    amount: amountIndex === -1 ? 1 : amountIndex,
    people: peopleIndex === -1 ? 2 : peopleIndex
  };

  return sheetRows
    .slice(hasHeader ? 1 : 0)
    .filter((row) => row.some((cell) => cellText(cell)))
    .map((row) => ({
      period: normalizeImportPeriod(row[indexes.month]),
      amount: Number(row[indexes.amount]),
      people: Number(row[indexes.people])
    }));
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  importing.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const rows = parseImportRows(sheetRows);

    if (rows.length === 0) {
      ElMessage.warning('没有可导入的数据');
      return;
    }

    const result = await receiptApi.importRows({ channel: importChannel.value, rows });
    ElMessage.success(`导入成功：新增 ${result.created} 条，更新 ${result.updated} 条`);

    recordFilters.granularity = 'month';
    recordFilters.period = getCurrentPeriod('year');
    activeView.value = 'entry';
    await Promise.all([refreshRecords(), refreshAnalytics()]);
  } catch (error) {
    ElMessage.error(error.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

async function submitForm() {
  await formRef.value.validate();
  saving.value = true;

  const preservedSelection = {
    channel: form.channel,
    granularity: form.granularity,
    period: form.period
  };

  try {
    const payload = {
      channel: form.channel,
      granularity: form.granularity,
      period: form.period,
      amount: Number(form.amount),
      people: Number(form.people)
    };

    if (editingId.value) {
      await receiptApi.update(editingId.value, payload);
      ElMessage.success('修改成功');
    } else {
      await receiptApi.create(payload);
      ElMessage.success('新增成功');
    }

    importChannel.value = form.channel;
    recordFilters.granularity = form.granularity;
    recordFilters.period = getParentPeriod(form.granularity, form.period);
    activeView.value = 'entry';

    resetForm(preservedSelection);
    closeEntryDialog();
    await Promise.all([refreshRecords(), refreshAnalytics()]);
  } catch (error) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function startEdit(item) {
  activeView.value = 'entry';
  editingId.value = item.id;
  importChannel.value = item.channel;

  Object.assign(form, {
    channel: item.channel,
    granularity: item.granularity,
    period: item.period,
    amount: String(item.amount),
    people: String(item.people)
  });

  entryDialogVisible.value = true;
  nextTick(() => formRef.value?.clearValidate());
}

async function deleteItem(id) {
  try {
    await receiptApi.remove(id);
    ElMessage.success('删除成功');
    await Promise.all([refreshRecords(), refreshAnalytics()]);
  } catch (error) {
    ElMessage.error(error.message || '删除失败');
  }
}

function renderChart() {
  const chartElement = chartRef.value;
  if (!chartElement) return;

  if (!chartElement.clientWidth || !chartElement.clientHeight) {
    requestAnimationFrame(() => {
      if (activeView.value === 'analytics') renderChart();
    });
    return;
  }

  if (!chartInstance || chartInstance.getDom() !== chartElement) {
    chartInstance?.dispose();
    chartInstance = echarts.init(chartElement);
  }

  const unit = analytics.metric === 'amount' ? '元' : '人';
  const chartRows = visibleTrendRows.value;
  const xAxisData = chartRows.map((item) => item.period);
  const wechatData = chartRows.map((item) => Number(item.summary?.wechat?.[analytics.metric] || 0));
  const alipayData = chartRows.map((item) => Number(item.summary?.alipay?.[analytics.metric] || 0));
  const cashData = chartRows.map((item) => Number(item.summary?.cash?.[analytics.metric] || 0));
  const totalData = chartRows.map((item) => Number(item.summary?.total?.[analytics.metric] || 0));
  const noData = xAxisData.length === 0;

  chartInstance.setOption(
    {
      color: ['#0f766e', '#2563eb', '#f97316', '#f59e0b'],
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#132238',
        borderWidth: 0,
        textStyle: { color: '#f8fafc' },
        valueFormatter: (value) => `${value}${unit}`
      },
      legend: {
        top: 6,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: { color: '#38506b' },
        data: ['微信', '支付宝', '现金', '合计']
      },
      grid: {
        top: 56,
        left: 12,
        right: 20,
        bottom: 16,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#bfd2df' } },
        axisLabel: {
          color: '#547086',
          formatter: (value) => {
            if (analytics.dimension === 'year') return value;
            if (analytics.dimension === 'month') return value.slice(5);
            return value.slice(8);
          }
        },
        data: xAxisData
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.2)' } },
        axisLabel: {
          color: '#547086',
          formatter: (value) => `${value}${unit}`
        }
      },
      graphic: noData
        ? [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: {
                text: '暂无趋势数据',
                fill: '#7f93a5',
                fontSize: 15,
                fontFamily: 'inherit'
              }
            }
          ]
        : [],
      series: [
        {
          name: '微信',
          type: 'line',
          smooth: true,
          symbolSize: 8,
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.08 },
          data: wechatData
        },
        {
          name: '支付宝',
          type: 'line',
          smooth: true,
          symbolSize: 8,
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.06 },
          data: alipayData
        },
        {
          name: '现金',
          type: 'line',
          smooth: true,
          symbolSize: 8,
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.05 },
          data: cashData
        },
        {
          name: '合计',
          type: 'line',
          smooth: true,
          symbolSize: 7,
          lineStyle: { width: 2, type: 'dashed' },
          data: totalData
        }
      ]
    },
    true
  );

  chartInstance.resize();
}

function resizeChart() {
  chartInstance?.resize();
}

watch(
  () => activeView.value,
  async (nextValue) => {
    if (nextValue === 'analytics') {
      await nextTick();
      await waitForPaint();
      renderChart();
    }
  }
);

watch(
  () => analytics.metric,
  () => {
    if (activeView.value === 'analytics') renderChart();
  }
);

watch(
  () => records.value.length,
  (length) => {
    const maxPage = Math.max(1, Math.ceil(length / pagination.pageSize));
    if (pagination.currentPage > maxPage) pagination.currentPage = maxPage;
  }
);

onMounted(async () => {
  await loadUsers();
  await Promise.all([refreshAnalytics(), refreshRecords()]);
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chartInstance?.dispose();
});
</script>
