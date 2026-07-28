<template>
  <div v-if="!isLoggedIn" class="login-shell">
    <section class="login-backdrop" aria-label="产品概览">
      <div class="brand-block login-hero-brand">
        <span class="brand-mark">收</span>
        <div>
          <strong>商家收款台账</strong>
          <small>门店收款、台账、导入与异常核对</small>
        </div>
      </div>
      <div class="login-hero-copy">
        <span class="eyebrow">Revenue Workspace</span>
        <h1>把每天的收款录清楚，把经营变化看明白。</h1>
        <p>移动端快速录入，PC 端高效筛选、导出和核对，适合老板随时掌握门店现金流。</p>
      </div>
      <div class="login-preview">
        <div class="preview-bar">
          <span>今日</span>
          <strong>¥8,426</strong>
        </div>
        <div class="preview-lines">
          <i style="width: 76%"></i>
          <i style="width: 58%"></i>
          <i style="width: 88%"></i>
          <i style="width: 42%"></i>
        </div>
        <div class="preview-grid">
          <span>微信 52%</span>
          <span>支付宝 41%</span>
          <span>现金 7%</span>
        </div>
      </div>
    </section>

    <section class="login-card">
      <div class="login-copy">
        <span class="eyebrow">{{ authMode === 'login' ? 'Login' : 'Register' }}</span>
        <h1>{{ authMode === 'login' ? '登录系统' : '注册账号' }}</h1>
        <p>{{ authMode === 'login' ? '未登录无法查看看板、台账和导入数据。' : '创建账号后会自动进入系统。' }}</p>
      </div>

      <el-segmented v-model="authMode" :options="authModeOptions" />

      <el-form label-position="top" @submit.prevent>
        <el-form-item label="账号">
          <el-input v-model="authForm.account" size="large" maxlength="24" placeholder="请输入账号名称" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="authForm.password"
            size="large"
            type="password"
            show-password
            placeholder="请输入密码"
            @keyup.enter="authMode === 'login' ? login() : register()"
          />
        </el-form-item>
        <el-form-item v-if="authMode === 'register'" label="确认密码">
          <el-input
            v-model="authForm.confirmPassword"
            size="large"
            type="password"
            show-password
            placeholder="再次输入密码"
            @keyup.enter="register"
          />
        </el-form-item>
      </el-form>

      <el-button
        type="primary"
        size="large"
        class="login-button"
        :loading="loginLoading"
        @click="authMode === 'login' ? login() : register()"
      >
        {{ authMode === 'login' ? '登录' : '注册并进入' }}
      </el-button>
      <p class="login-tip">默认管理员：账号“管理员”，密码“admin123”。</p>
    </section>
  </div>

  <div v-else class="app-shell">
    <aside class="side-nav">
      <div class="brand-block">
        <span class="brand-mark">收</span>
        <div>
          <strong>商家收款台账</strong>
          <small>录得快 · 看得清 · 导得出</small>
        </div>
      </div>

      <nav class="nav-list" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.value"
          type="button"
          class="nav-item"
          :class="{ active: activeView === item.value, 'is-mobile-secondary': item.secondary }"
          @click="switchView(item.value)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <small>{{ item.shortLabel }}</small>
        </button>
        <el-dropdown class="mobile-nav-more" trigger="click" placement="bottom-end" @command="switchView">
          <button
            type="button"
            class="nav-item"
            :class="{ active: secondaryNavItems.some((item) => item.value === activeView) }"
            aria-label="更多功能"
          >
            <el-icon><MoreFilled /></el-icon>
            <small>更多</small>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in secondaryNavItems" :key="item.value" :command="item.value">
                <el-icon><component :is="item.icon" /></el-icon>
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>

      <div class="current-user">
        <span>当前用户</span>
        <el-dropdown trigger="click" placement="bottom-end" @command="handleUserChange">
          <button
            type="button"
            class="current-user-avatar"
            :aria-label="currentUserLabel"
            :title="currentUserLabel"
          >
            {{ currentUserInitial }}
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="item in users"
                :key="item.id"
                class="user-dropdown-option"
                :class="{ 'is-current': item.id === currentUserId }"
                :command="item.id"
                :disabled="userProfile(item.id).status === 'disabled'"
              >
                <span class="user-menu-avatar">{{ userInitial(item) }}</span>
                <span class="user-menu-name">{{ item.name }}</span>
                <span class="user-role-tag" :class="`is-${userProfile(item.id).role}`">
                  {{ roleText(userProfile(item.id).role) }}
                </span>
                <span v-if="userProfile(item.id).status === 'disabled'" class="user-status-tag">禁用</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button class="logout-button" aria-label="注销" title="注销" @click="logout">
          <el-icon><SwitchButton /></el-icon>
          <span class="logout-label">注销</span>
        </el-button>
      </div>
    </aside>

    <div class="main-shell">
      <header class="topbar">
        <div>
          <span class="eyebrow">{{ activeMeta.kicker }}</span>
          <h1>{{ activeMeta.title }}</h1>
          <p>{{ activeMeta.desc }}</p>
        </div>
        <div class="topbar-actions">
          <el-button @click="refreshAll">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            新建收款
          </el-button>
        </div>
      </header>

      <main class="workspace">
        <section v-if="activeView === 'dashboard'" class="page-stack" v-loading="analyticsLoading">
          <section class="panel compact-panel">
            <div class="filter-row dashboard-filter-row">
              <div class="field">
                <label>时间范围</label>
                <el-select v-model="analytics.range" class="full-control" @change="handleAnalyticsRangeChange">
                  <el-option v-for="item in analyticsRangeOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div v-if="analytics.range === 'current'" class="field">
                <label>统计粒度</label>
                <el-segmented v-model="analytics.dimension" :options="analyticsGranularityOptions" @change="handleAnalyticsDimensionChange" />
              </div>
              <div v-if="analytics.range === 'current'" class="field">
                <label>统计周期</label>
                <el-date-picker
                  v-if="analytics.dimension !== 'year'"
                  v-model="analytics.period"
                  :type="analyticsPicker.type"
                  :format="analyticsPicker.format"
                  :value-format="analyticsPicker.valueFormat"
                  :placeholder="analyticsPicker.placeholder"
                  class="full-control"
                  :editable="false"
                  @change="refreshAnalyticsFromFilter"
                />
                <el-select
                  v-else
                  v-model="analytics.years"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  class="full-control"
                  @change="handleYearSelectionChange"
                >
                  <el-option v-for="year in yearOptions" :key="year" :label="`${year} 年`" :value="year" />
                </el-select>
              </div>
              <div v-else class="field">
                <label>当前展示</label>
                <div class="range-readout">{{ analyticsRangeLabel }}</div>
              </div>
              <div class="field">
                <label>渠道</label>
                <el-select v-model="analytics.channel" class="full-control" @change="refreshAnalyticsFromFilter">
                  <el-option v-for="item in channelFilterOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div class="field actions-field">
                <el-button @click="exportDashboard">
                  <el-icon><Download /></el-icon>
                  导出报表
                </el-button>
              </div>
            </div>
          </section>

          <el-alert
            v-if="analyticsFallbackNotice"
            class="context-alert"
            type="info"
            :closable="false"
            show-icon
            :title="analyticsFallbackNotice"
          />

          <section class="metric-grid">
            <article v-for="item in metricCards" :key="item.key" class="metric-card" :class="item.className">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.note }}</small>
            </article>
          </section>

          <section class="dashboard-grid">
            <article class="panel chart-panel">
              <div class="panel-heading">
                <div style="width: 120px">
                  <span class="eyebrow">Trend</span>
                  <h2>收款趋势</h2>
                </div>
                <el-segmented v-model="analytics.metric" :options="metricOptions" @change="renderCharts" />
              </div>
              <div ref="trendChartRef" class="chart-box" role="img" :aria-label="trendChartDescription"></div>
              <details class="chart-data-details">
                <summary>查看趋势明细</summary>
                <div class="chart-data-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>周期</th>
                        <th v-for="item in dashboardChannelOptions" :key="`head-${item.value}`">{{ item.label }}</th>
                        <th>合计</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in visibleTrendRows" :key="`trend-${row.period}`">
                        <td>{{ formatPeriodLabel(analytics.dimension, row.period) }}</td>
                        <td v-for="item in dashboardChannelOptions" :key="`${row.period}-${item.value}`">
                          {{ formatChartValue(row.summary[item.value]?.[analytics.metric]) }}
                        </td>
                        <td>{{ formatChartValue(row.summary.total?.[analytics.metric]) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">Mix</span>
                  <h2>渠道占比</h2>
                </div>
              </div>
              <div ref="mixChartRef" class="mix-chart" role="img" :aria-label="mixChartDescription"></div>
              <div class="mix-list">
                <div v-for="item in positiveShareRows" :key="item.key" class="mix-row">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.percent }}%</strong>
                </div>
                <el-empty v-if="positiveShareRows.length === 0" :image-size="56" description="当前范围暂无渠道数据" />
              </div>
            </article>
          </section>

          <section class="dashboard-grid lower">
            <article class="panel">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">Alerts</span>
                  <h2>异常提醒</h2>
                </div>
              </div>
              <div class="alert-list">
                <div v-for="item in anomalyRows" :key="item.key" class="alert-item" :class="item.level">
                  <el-icon><Warning /></el-icon>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.desc }}</span>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">Recent</span>
                  <h2>最近录入</h2>
                </div>
                <el-button text type="primary" @click="switchView('ledger')">查看台账</el-button>
              </div>
              <div class="recent-list">
                <div v-for="item in recentRecords" :key="item.id" class="recent-item">
                  <div>
                    <strong>{{ money(getEffectiveAmount(item)) }}</strong>
                    <span>{{ formatPeriodLabel(item.granularity, item.period) }} · {{ channelText(item.channel) }}</span>
                  </div>
                  <el-tag :type="entryModeTag(item.entryMode)">{{ entryModeText(item.entryMode) }}</el-tag>
                </div>
              </div>
            </article>
          </section>
        </section>

        <section v-if="activeView === 'ledger'" class="page-stack" v-loading="recordsLoading">
          <section class="panel compact-panel">
            <div class="filter-row ledger-filter-row">
              <div class="field">
                <label>日期粒度</label>
                <el-segmented v-model="recordFilters.granularity" :options="entryGranularityOptions" @change="handleRecordGranularityChange" />
              </div>
              <div class="field">
                <label>{{ recordFilterPeriodLabel }}</label>
                <el-date-picker
                  v-model="recordFilters.period"
                  :type="recordFilterPicker.type"
                  :format="recordFilterPicker.format"
                  :value-format="recordFilterPicker.valueFormat"
                  :placeholder="recordFilterPicker.placeholder"
                  clearable
                  class="full-control"
                  :editable="false"
                  @change="refreshRecordsFromFilter"
                />
              </div>
              <div class="field">
                <label>渠道</label>
                <el-select v-model="recordFilters.channel" class="full-control" @change="refreshRecordsFromFilter">
                  <el-option v-for="item in channelFilterOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
              <div class="field">
                <label>录入方式</label>
                <el-select v-model="recordFilters.entryMode" class="full-control">
                  <el-option label="全部方式" value="all" />
                  <el-option label="手动录入" value="manual" />
                  <el-option label="Excel 导入" value="import" />
                </el-select>
              </div>
              <div class="field search-field">
                <label>搜索备注</label>
                <el-input v-model="recordFilters.keyword" clearable placeholder="输入备注/关键字">
                  <template #prefix><el-icon><Search /></el-icon></template>
                </el-input>
              </div>
            </div>
          </section>

          <el-alert
            v-if="recordFallbackNotice"
            class="context-alert"
            type="info"
            :closable="false"
            show-icon
            :title="recordFallbackNotice"
          />

          <section class="summary-strip">
            <article>
              <span>记录数</span>
              <strong>{{ filteredRecords.length }}</strong>
            </article>
            <article>
              <span>总金额</span>
              <strong>{{ money(recordTotalAmount) }}</strong>
            </article>
            <article>
              <span>总人数</span>
              <strong>{{ recordTotalPeople }} 人</strong>
            </article>
            <article>
              <span>客单价</span>
              <strong>{{ formatAverage(recordAverage) }}</strong>
            </article>
          </section>

          <section class="panel table-panel">
            <div class="panel-heading table-heading">
              <div>
                <span class="eyebrow">Ledger</span>
                <h2>收款台账</h2>
              </div>
              <div class="heading-actions">
                <el-button :disabled="selectedRows.length === 0" @click="exportSelected">
                  <el-icon><Download /></el-icon>
                  导出选中
                </el-button>
                <el-button @click="exportRecords">
                  <el-icon><Download /></el-icon>
                  导出当前筛选
                </el-button>
              </div>
            </div>

            <el-table
              class="desktop-table"
              :data="pagedRecords"
              border
              stripe
              @selection-change="selectedRows = $event"
            >
              <el-table-column type="selection" width="42" />
              <el-table-column prop="period" label="收款日期" min-width="118">
                <template #default="{ row }">{{ formatPeriodLabel(row.granularity, row.period) }}</template>
              </el-table-column>
              <el-table-column prop="granularity" label="粒度" width="82">
                <template #default="{ row }">{{ granularityText(row.granularity) }}</template>
              </el-table-column>
              <el-table-column prop="channel" label="渠道" width="98">
                <template #default="{ row }">
                  <el-tag class="channel-tag" :class="channelTagClass(row.channel)">
                    {{ channelText(row.channel) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="收款金额" min-width="130" align="right">
                <template #default="{ row }">{{ money(getEffectiveAmount(row)) }}</template>
              </el-table-column>
              <el-table-column label="收款人数" width="100" align="right">
                <template #default="{ row }">{{ getEffectivePeople(row) }}</template>
              </el-table-column>
              <el-table-column label="录入方式" width="108">
                <template #default="{ row }"><el-tag :type="entryModeTag(row.entryMode)">{{ entryModeText(row.entryMode) }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
              <el-table-column label="附件" width="92">
                <template #default="{ row }">{{ attachmentText(row.attachmentStatus) }}</template>
              </el-table-column>
              <el-table-column prop="updatedAt" label="更新时间" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="260" fixed="right">
                <template #default="{ row }">
                  <el-button text type="primary" @click="startEdit(row)">编辑</el-button>
                  <el-popconfirm title="确认删除这条记录吗？" @confirm="deleteItem(row.id)">
                    <template #reference><el-button text type="danger">删除</el-button></template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>

            <div class="mobile-record-list">
              <article v-for="item in pagedRecords" :key="`card-${item.id}`" class="record-card">
                <div>
                  <div class="record-top">
                    <div class="record-amount-select">
                      <el-checkbox
                        :model-value="isRecordSelected(item.id)"
                        :aria-label="`选择 ${formatPeriodLabel(item.granularity, item.period)} 的收款记录`"
                        @change="toggleRecordSelection(item, $event)"
                      />
                      <strong>{{ money(getEffectiveAmount(item)) }}</strong>
                    </div>
                    <el-tag class="channel-tag" :class="channelTagClass(item.channel)">
                      {{ channelText(item.channel) }}
                    </el-tag>
                  </div>
                  <span class="record-meta">
                    {{ formatPeriodLabel(item.granularity, item.period) }} · {{ granularityText(item.granularity) }} · {{ entryModeText(item.entryMode) }}
                  </span>
                  <p v-if="item.remark">{{ item.remark }}</p>
                </div>
                <div class="record-card-actions">
                  <el-button circle type="primary" plain aria-label="编辑收款" title="编辑收款" @click="startEdit(item)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-popconfirm title="确认删除这条记录吗？" @confirm="deleteItem(item.id)">
                    <template #reference>
                      <el-button circle type="danger" plain aria-label="删除收款" title="删除收款">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </article>
            </div>

            <el-empty v-if="!recordsLoading && filteredRecords.length === 0" description="当前筛选条件下暂无数据" />
            <div v-if="filteredRecords.length > pagination.pageSize" class="pagination-wrap">
              <el-pagination
                v-model:current-page="pagination.currentPage"
                v-model:page-size="pagination.pageSize"
                background
                layout="prev, pager, next"
                :total="filteredRecords.length"
              />
            </div>
          </section>
        </section>

        <section v-if="activeView === 'record'" class="record-page-grid">
          <section class="panel form-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Entry</span>
                <h2>{{ editingId ? '编辑收款' : '新建收款' }}</h2>
              </div>
              <el-tag v-if="draftSavedAt" type="info">草稿 {{ draftSavedAt }}</el-tag>
            </div>
            <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="entry-form">
              <div class="form-grid">
                <el-form-item label="统计粒度" prop="granularity">
                  <el-segmented v-model="form.granularity" :options="entryGranularityOptions" @change="handleFormGranularityChange" />
                </el-form-item>
                <el-form-item label="收款渠道" prop="channel">
                  <el-select v-model="form.channel" class="full-control">
                    <el-option v-for="item in enabledChannelOptions" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="收款日期" prop="period">
                  <el-date-picker
                    v-model="form.period"
                    :type="entryPicker.type"
                    :format="entryPicker.format"
                    :value-format="entryPicker.valueFormat"
                    :placeholder="entryPicker.placeholder"
                    class="full-control"
                    :editable="false"
                  />
                </el-form-item>
                <el-form-item label="收款金额" prop="amount">
                  <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" class="full-control" />
                </el-form-item>
                <el-form-item label="收款人数" prop="people">
                  <el-input-number v-model="form.people" :min="0" :precision="0" :step="1" class="full-control" />
                </el-form-item>
                <el-form-item label="附件状态">
                  <el-select v-model="form.attachmentStatus" class="full-control">
                    <el-option label="无附件" value="none" />
                    <el-option label="已上传" value="uploaded" />
                    <el-option label="待补充" value="pending" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="备注 / 异常说明">
                <el-input v-model="form.remark" type="textarea" :rows="4" maxlength="200" show-word-limit placeholder="可填写活动、退款、异常波动等说明" />
              </el-form-item>
            </el-form>
            <div class="mobile-entry-checks">
              <strong>录入校验</strong>
              <ul class="check-list">
                <li :class="{ pass: Number(form.amount) > 0 }">金额必须大于 0</li>
                <li :class="{ pass: Number.isInteger(Number(form.people)) && Number(form.people) >= 0 }">人数不可为负</li>
                <li :class="{ pass: isPeriodInRange(form.granularity, form.period) }">日期不可超出允许范围</li>
                <li :class="{ pass: Boolean(form.channel) }">渠道来自启用配置</li>
              </ul>
            </div>
            <div class="form-actions entry-actions">
              <el-popconfirm title="确认清空当前填写内容吗？" @confirm="resetFormForCreate">
                <template #reference><el-button class="clear-entry-button" text type="danger">清空内容</el-button></template>
              </el-popconfirm>
              <el-button class="save-entry-button" :loading="saving" @click="submitForm(false)">保存</el-button>
              <el-button class="continue-entry-button" type="primary" :loading="saving" @click="submitForm(true)">保存并继续</el-button>
            </div>
          </section>

          <aside class="panel side-helper">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Checks</span>
                <h2>录入校验</h2>
              </div>
            </div>
            <ul class="check-list">
              <li :class="{ pass: Number(form.amount) > 0 }">金额必须大于 0</li>
              <li :class="{ pass: Number.isInteger(Number(form.people)) && Number(form.people) >= 0 }">人数不可为负</li>
              <li :class="{ pass: isPeriodInRange(form.granularity, form.period) }">日期不可超出允许范围</li>
              <li :class="{ pass: Boolean(form.channel) }">渠道来自启用配置</li>
            </ul>
          </aside>
        </section>

        <section v-if="activeView === 'import'" class="page-stack">
          <section class="panel">
            <div class="panel-heading table-heading">
              <p class="panel-brief">上传后先预校验，再确认渠道字段来源或统一赋值规则。</p>
              <div class="heading-actions">
                <el-button tag="a" href="/receipt-import-template.csv" download="收款导入模板.csv">
                  <el-icon><Download /></el-icon>
                  下载模板
                </el-button>
                <el-button type="primary" :loading="importing" @click="triggerImport">
                  <el-icon><Upload /></el-icon>
                  上传 Excel
                </el-button>
                <input ref="importInput" type="file" accept=".xlsx,.xls,.csv" class="hidden-file-input" @change="handleImportFile" />
              </div>
            </div>

            <div class="import-controls">
              <div class="field">
                <label>渠道来源</label>
                <el-radio-group v-model="importWizard.channelMode">
                  <el-radio-button label="file">使用文件渠道列</el-radio-button>
                  <el-radio-button label="uniform">统一赋值</el-radio-button>
                </el-radio-group>
              </div>
              <div v-if="importWizard.channelMode === 'uniform'" class="field">
                <label>统一渠道</label>
                <el-select v-model="importWizard.uniformChannel" class="full-control" @change="validateImportRows">
                  <el-option v-for="item in enabledChannelOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </div>
            </div>

            <section class="summary-strip import-summary">
              <article>
                <span>预览行</span>
                <strong>{{ importPreview.length }}</strong>
              </article>
              <article>
                <span>可导入</span>
                <strong>{{ validImportRows.length }}</strong>
              </article>
              <article>
                <span>异常行</span>
                <strong>{{ invalidImportRows.length }}</strong>
              </article>
              <article>
                <span>渠道策略</span>
                <strong>{{ importWizard.channelMode === 'file' ? '文件列' : channelText(importWizard.uniformChannel) }}</strong>
              </article>
            </section>

            <el-table :data="importPreview" border stripe max-height="420" class="import-table responsive-table">
              <el-table-column prop="rowNumber" label="行号" width="72" />
              <el-table-column prop="period" label="日期/周期" min-width="116" />
              <el-table-column prop="granularity" label="粒度" width="90">
                <template #default="{ row }">{{ granularityText(row.granularity) }}</template>
              </el-table-column>
              <el-table-column prop="channel" label="渠道" width="96">
                <template #default="{ row }">{{ channelText(row.channel) }}</template>
              </el-table-column>
              <el-table-column prop="amount" label="金额" width="110" />
              <el-table-column prop="people" label="人数" width="90" />
              <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip />
              <el-table-column label="校验结果" min-width="220">
                <template #default="{ row }">
                  <el-tag v-if="row.errors.length === 0" type="success">通过</el-tag>
                  <div v-else class="error-tags">
                    <el-tag v-for="error in row.errors" :key="error" type="danger">{{ error }}</el-tag>
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <div class="mobile-data-list import-mobile-list">
              <article v-for="row in importPreview" :key="`import-${row.rowNumber}`" class="mobile-data-card import-row-card">
                <div class="mobile-card-heading">
                  <strong>第 {{ row.rowNumber }} 行</strong>
                  <el-tag :type="row.errors.length === 0 ? 'success' : 'danger'">
                    {{ row.errors.length === 0 ? '校验通过' : `${row.errors.length} 项异常` }}
                  </el-tag>
                </div>
                <dl class="mobile-detail-grid">
                  <div><dt>日期/周期</dt><dd>{{ row.period || '-' }}</dd></div>
                  <div><dt>粒度</dt><dd>{{ granularityText(row.granularity) }}</dd></div>
                  <div>
                    <dt>渠道</dt>
                    <dd><el-tag class="channel-tag" :class="channelTagClass(row.channel)">{{ channelText(row.channel) }}</el-tag></dd>
                  </div>
                  <div><dt>金额 / 人数</dt><dd>{{ money(row.amount) }} / {{ row.people }} 人</dd></div>
                </dl>
                <p v-if="row.remark" class="mobile-card-note">{{ row.remark }}</p>
                <div v-if="row.errors.length" class="error-tags">
                  <el-tag v-for="error in row.errors" :key="error" type="danger">{{ error }}</el-tag>
                </div>
              </article>
              <el-empty v-if="importPreview.length === 0" :image-size="72" description="上传文件后在这里查看逐行校验结果" />
            </div>

            <div class="form-actions">
              <el-button @click="exportRecords">导出当前筛选结果</el-button>
              <el-button @click="exportDashboard">导出看板汇总报表</el-button>
              <el-button type="primary" :disabled="validImportRows.length === 0" :loading="importing" @click="importValidRows">
                只导入通过校验的数据
              </el-button>
            </div>
            <p v-if="validImportRows.length === 0" class="action-hint">上传文件并至少通过一行校验后即可导入。</p>
          </section>
        </section>

        <section v-if="activeView === 'users'" class="page-stack">
          <section class="panel">
            <div class="panel-heading table-heading">
              <div>
                <span class="eyebrow">Access</span>
                <h2>用户与权限</h2>
              </div>
              <el-button type="primary" @click="openUserDialog">
                <el-icon><Plus /></el-icon>
                新增用户
              </el-button>
            </div>
            <el-table :data="usersWithProfiles" border stripe class="responsive-table">
              <el-table-column prop="name" label="用户" min-width="140" />
              <el-table-column prop="role" label="角色" min-width="150">
                <template #default="{ row }">
                  <el-select v-model="row.profile.role" @change="saveUserProfiles">
                    <el-option label="管理员" value="admin" />
                    <el-option label="老板/店长" value="manager" />
                    <el-option label="店员" value="clerk" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="授权范围" min-width="180">
                <template #default="{ row }">{{ roleScopeText(row.profile.role) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="180">
                <template #default="{ row }">
                  <el-switch
                    v-model="row.profile.status"
                    active-value="enabled"
                    inactive-value="disabled"
                    active-text="启用"
                    inactive-text="禁用"
                    @change="saveUserProfiles"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="createdAt" label="创建时间" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
              </el-table-column>
            </el-table>

            <div class="mobile-data-list user-mobile-list">
              <article v-for="row in usersWithProfiles" :key="`user-${row.id}`" class="mobile-data-card user-card">
                <div class="mobile-card-heading">
                  <div class="mobile-user-identity">
                    <span class="user-menu-avatar">{{ userInitial(row) }}</span>
                    <div>
                      <strong>{{ row.name }}</strong>
                      <small>{{ formatDateTime(row.createdAt) }}</small>
                    </div>
                  </div>
                  <el-switch
                    v-model="row.profile.status"
                    active-value="enabled"
                    inactive-value="disabled"
                    inline-prompt
                    active-text="启"
                    inactive-text="停"
                    :aria-label="`${row.name}账号状态`"
                    @change="saveUserProfiles"
                  />
                </div>
                <div class="field">
                  <label>角色</label>
                  <el-select v-model="row.profile.role" class="full-control" @change="saveUserProfiles">
                    <el-option label="管理员" value="admin" />
                    <el-option label="老板/店长" value="manager" />
                    <el-option label="店员" value="clerk" />
                  </el-select>
                </div>
                <p class="mobile-card-note"><strong>授权范围：</strong>{{ roleScopeText(row.profile.role) }}</p>
              </article>
            </div>
          </section>
        </section>

        <section v-if="activeView === 'logs'" class="page-stack">
          <section class="panel compact-panel">
            <div class="filter-row">
              <div class="field">
                <label>用户</label>
                <el-select v-model="logFilters.userId" class="full-control">
                  <el-option label="全部用户" value="all" />
                  <el-option v-for="item in users" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
              </div>
              <div class="field">
                <label>操作类型</label>
                <el-select v-model="logFilters.action" class="full-control">
                  <el-option label="全部操作" value="all" />
                  <el-option v-for="item in logActionOptions" :key="item" :label="item" :value="item" />
                </el-select>
              </div>
              <div class="field search-field">
                <label>关键字</label>
                <el-input v-model="logFilters.keyword" clearable placeholder="搜索变更内容" />
              </div>
            </div>
          </section>
          <section class="panel table-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Audit</span>
                <h2>操作日志</h2>
              </div>
            </div>
            <el-table :data="filteredLogs" border stripe class="responsive-table">
              <el-table-column prop="time" label="时间" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.time) }}</template>
              </el-table-column>
              <el-table-column prop="userName" label="操作人" width="120" />
              <el-table-column prop="action" label="操作" width="120" />
              <el-table-column prop="detail" label="变更内容" min-width="260" show-overflow-tooltip />
            </el-table>

            <div class="mobile-data-list log-mobile-list">
              <article v-for="row in filteredLogs" :key="`log-${row.id}`" class="mobile-data-card log-card">
                <div class="mobile-card-heading">
                  <el-tag type="info">{{ row.action }}</el-tag>
                  <time>{{ formatDateTime(row.time) }}</time>
                </div>
                <p class="log-detail">{{ row.detail }}</p>
                <span class="log-user">操作人：{{ row.userName || '-' }}</span>
              </article>
              <el-empty v-if="filteredLogs.length === 0" :image-size="72" description="暂无符合条件的操作日志" />
            </div>
          </section>
        </section>

        <section v-if="activeView === 'settings'" class="settings-grid">
          <section class="panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Channels</span>
                <h2>渠道配置</h2>
              </div>
              <el-tag v-if="settingsSavedAt" type="success" effect="plain">已自动保存 {{ settingsSavedAt }}</el-tag>
            </div>
            <div class="setting-list">
              <div v-for="item in channelOptions" :key="item.value" class="setting-row">
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>启用后可在录入、筛选和导入中使用</span>
                </div>
                <el-switch v-model="settings.channels[item.value]" @change="saveSettings" />
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Defaults</span>
                <h2>默认统计口径</h2>
              </div>
            </div>
            <div class="settings-form">
              <div class="field">
                <label>默认看板粒度</label>
                <el-select v-model="settings.defaultDimension" class="full-control" @change="saveSettings">
                  <el-option label="年" value="year" />
                  <el-option label="月" value="month" />
                  <el-option label="日" value="day" />
                </el-select>
              </div>
              <div class="field">
                <label>导入模板字段</label>
                <el-input v-model="settings.importFields" @change="saveSettings" />
              </div>
              <div class="field">
                <label>门店配置</label>
                <el-input v-model="settings.storeName" @change="saveSettings" />
              </div>
              <div class="field">
                <label>看板默认时间范围</label>
                <el-select v-model="settings.defaultRange" class="full-control" @change="handleDefaultRangeSettingChange">
                  <el-option label="当前周期" value="current" />
                  <el-option label="近 7 天" value="last7" />
                  <el-option label="近 12 个月" value="last12" />
                </el-select>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>

    <button v-if="['dashboard', 'ledger'].includes(activeView)" type="button" class="mobile-fab" @click="openCreate">
      <el-icon><Plus /></el-icon>
      新建收款
    </button>

    <el-dialog v-model="userDialogVisible" title="新增用户" width="min(92vw, 420px)">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="用户名称">
          <el-input v-model="userForm.name" maxlength="24" placeholder="请输入用户名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="userSaving" @click="createUser">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';
import { ElMessage } from 'element-plus';
import {
  DataAnalysis,
  Delete,
  Download,
  Edit,
  Files,
  MoreFilled,
  Plus,
  Refresh,
  Search,
  Setting,
  SwitchButton,
  Tickets,
  Upload,
  User,
  Warning
} from '@element-plus/icons-vue';
import { receiptApi, setActiveUserId, userApi } from './api';

const USER_STORAGE_KEY = 'merchant-receipt-current-user-id';
const SETTINGS_KEY = 'merchant-receipt-settings-v2';
const USER_PROFILE_KEY = 'merchant-receipt-user-profiles-v2';
const LOG_KEY = 'merchant-receipt-operation-logs-v2';
const DRAFT_KEY = 'merchant-receipt-draft-v2';
const DEFAULT_USER_ID = 'admin';

const channelOptions = [
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'cash', label: '现金' },
  { value: 'other', label: '其他' }
];
const channelTagClasses = {
  wechat: 'is-wechat',
  alipay: 'is-alipay',
  cash: 'is-cash',
  other: 'is-other'
};

const navItems = [
  { value: 'dashboard', label: '经营看板', shortLabel: '看板', kicker: 'Dashboard', title: '首页 / 经营看板', desc: '快速掌握当前范围的金额、人数、客单价和渠道结构。', icon: DataAnalysis },
  { value: 'ledger', label: '收款台账', shortLabel: '台账', kicker: 'Ledger', title: '收款台账', desc: '集中筛选、修改、删除和导出所有收款记录。', icon: Tickets },
  { value: 'record', label: '新建/编辑', shortLabel: '录入', kicker: 'Entry', title: '新建 / 编辑收款', desc: '服务高频录入，支持保存并继续和草稿自动保存。', icon: Edit },
  { value: 'import', label: '导入导出', shortLabel: '导入', kicker: 'Excel', title: '批量导入导出', desc: '先预校验，再确认字段映射和渠道规则。', icon: Upload },
  { value: 'users', label: '用户权限', shortLabel: '用户', kicker: 'Access', title: '用户与权限', desc: '管理多人使用、角色分级和启停状态。', icon: User, secondary: true },
  { value: 'logs', label: '操作日志', shortLabel: '日志', kicker: 'Audit', title: '操作日志', desc: '追踪新增、编辑、删除、导入、导出和登录行为。', icon: Files, secondary: true },
  { value: 'settings', label: '系统配置', shortLabel: '配置', kicker: 'Settings', title: '系统配置', desc: '配置渠道、门店、统计口径和导入字段。', icon: Setting, secondary: true }
];

const secondaryNavItems = navItems.filter((item) => item.secondary);

const analyticsGranularityOptions = [
  { label: '年', value: 'year' },
  { label: '月', value: 'month' },
  { label: '日', value: 'day' }
];

const analyticsRangeOptions = [
  { label: '当前周期', value: 'current' },
  { label: '近 7 天', value: 'last7' },
  { label: '近 12 个月', value: 'last12' }
];

const entryGranularityOptions = [
  { label: '日度', value: 'day' },
  { label: '月度', value: 'month' }
];

const metricOptions = [
  { label: '金额', value: 'amount' },
  { label: '人数', value: 'people' }
];

const authModeOptions = [
  { label: '登录', value: 'login' },
  { label: '注册', value: 'register' }
];

const activeView = ref('dashboard');
const savedUserId = localStorage.getItem(USER_STORAGE_KEY) || '';
const isLoggedIn = ref(Boolean(savedUserId));
const currentUserId = ref(savedUserId);
const users = ref([]);
const records = ref([]);
const trendRows = ref([]);
const yearCompareSummaries = ref([]);
const selectedRows = ref([]);
const operationLogs = ref(readJson(LOG_KEY, []));
const userProfiles = ref(readJson(USER_PROFILE_KEY, {}));
const draftSavedAt = ref('');
const analyticsFallbackNotice = ref('');
const recordFallbackNotice = ref('');
const settingsSavedAt = ref('');
const analyticsInitialLoad = ref(true);
const recordsInitialLoad = ref(true);

const trendChartRef = ref();
const mixChartRef = ref();
const formRef = ref();
const importInput = ref();

const analyticsLoading = ref(false);
const recordsLoading = ref(false);
const saving = ref(false);
const importing = ref(false);
const loginLoading = ref(false);
const userSaving = ref(false);
const userDialogVisible = ref(false);

let trendChart = null;
let mixChart = null;

const settings = reactive({
  channels: { wechat: true, alipay: true, cash: true, other: true },
  defaultDimension: 'month',
  defaultRange: 'current',
  importFields: '收款日期, 统计粒度, 收款渠道, 收款金额, 收款人数, 备注',
  storeName: '默认门店',
  ...readJson(SETTINGS_KEY, {})
});

const analytics = reactive({
  range: settings.defaultRange || 'current',
  dimension: settings.defaultRange === 'last7' ? 'day' : settings.defaultRange === 'last12' ? 'month' : (settings.defaultDimension || 'month'),
  period: getCurrentPeriod(settings.defaultRange === 'last7' ? 'day' : settings.defaultRange === 'last12' ? 'month' : (settings.defaultDimension || 'month')),
  years: defaultCompareYears(),
  channel: 'all',
  metric: 'amount'
});

const recordFilters = reactive({
  granularity: 'day',
  period: getCurrentPeriod('month'),
  channel: 'all',
  entryMode: 'all',
  keyword: ''
});

const form = reactive({
  granularity: 'day',
  channel: 'wechat',
  period: getCurrentPeriod('day'),
  amount: null,
  people: null,
  remark: '',
  attachmentStatus: 'none'
});

const pagination = reactive({
  currentPage: 1,
  pageSize: 10
});

const summary = reactive(createSummaryState());
const compareSummary = reactive(createSummaryState());
const coreSummary = reactive({
  today: createSummaryState(),
  month: createSummaryState(),
  year: createSummaryState()
});

const importWizard = reactive({
  channelMode: 'file',
  uniformChannel: 'wechat',
  rawRows: []
});

const userForm = reactive({ name: '' });
const authMode = ref('login');
const authForm = reactive({ account: '', password: '', confirmPassword: '' });
const editingId = ref('');

const logFilters = reactive({
  userId: 'all',
  action: 'all',
  keyword: ''
});

const activeMeta = computed(() => navItems.find((item) => item.value === activeView.value) || navItems[0]);
const currentUser = computed(() => users.value.find((item) => item.id === currentUserId.value));
const currentUserLabel = computed(() => (currentUser.value ? `当前用户：${userDisplayName(currentUser.value)}` : '当前用户'));
const currentUserInitial = computed(() => userInitial(currentUser.value));
const enabledChannelOptions = computed(() => channelOptions.filter((item) => settings.channels[item.value]));
const dashboardChannelOptions = computed(() => (
  analytics.channel === 'all'
    ? channelOptions
    : channelOptions.filter((item) => item.value === analytics.channel)
));
const channelFilterOptions = computed(() => [{ value: 'all', label: '全部渠道' }, ...enabledChannelOptions.value]);
const yearOptions = computed(() => {
  const year = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => String(year - index));
});

const analyticsPicker = computed(() => {
  if (analytics.dimension === 'month') {
    return { type: 'month', format: 'YYYY 年 MM 月', valueFormat: 'YYYY-MM', placeholder: '选择月份' };
  }
  return { type: 'date', format: 'YYYY 年 MM 月 DD 日', valueFormat: 'YYYY-MM-DD', placeholder: '选择日期' };
});

const entryPicker = computed(() => (
  form.granularity === 'month'
    ? { type: 'month', format: 'YYYY 年 MM 月', valueFormat: 'YYYY-MM', placeholder: '选择月份' }
    : { type: 'date', format: 'YYYY 年 MM 月 DD 日', valueFormat: 'YYYY-MM-DD', placeholder: '选择日期' }
));

const recordFilterPicker = computed(() => (
  recordFilters.granularity === 'month'
    ? { type: 'year', format: 'YYYY 年', valueFormat: 'YYYY', placeholder: '筛选年份' }
    : { type: 'month', format: 'YYYY 年 MM 月', valueFormat: 'YYYY-MM', placeholder: '筛选月份' }
));

const recordFilterPeriodLabel = computed(() => (recordFilters.granularity === 'month' ? '筛选年份' : '筛选月份'));

const visibleSummary = computed(() => filterSummaryByChannel(summary, analytics.channel));
const visibleCompareSummary = computed(() => filterSummaryByChannel(compareSummary, analytics.channel));
const visibleTrendRows = computed(() => trendRows.value.map((item) => ({ ...item, summary: filterSummaryByChannel(item.summary, analytics.channel) })));
const analyticsRangeLabel = computed(() => {
  if (analytics.range === 'last7') return `截至 ${formatPeriodLabel('day', analytics.period)}的 7 天`;
  if (analytics.range === 'last12') return `截至 ${formatPeriodLabel('month', analytics.period)}的 12 个月`;
  return formatPeriodLabel(analytics.dimension, analytics.period);
});

const metricCards = computed(() => {
  const current = visibleSummary.value;
  return [
    { key: 'period-amount', label: '当前范围金额', value: money(current.total.amount), note: buildDeltaNote(current.total.amount, visibleCompareSummary.value.total.amount), className: 'card-green' },
    { key: 'period-people', label: '当前范围人数', value: `${current.total.people} 人`, note: analyticsRangeLabel.value, className: 'card-blue' },
    { key: 'period-average', label: '当前客单价', value: formatAverage(averageFromSummary(current)), note: '金额 ÷ 收款人数', className: 'card-amber' },
    { key: 'year', label: '本年收款金额', value: money(coreSummary.year.total.amount), note: `本年 ${coreSummary.year.total.people} 人`, className: 'card-rose' }
  ];
});

const shareRows = computed(() => {
  const data = visibleSummary.value;
  const total = Math.max(Number(data.total.amount || 0), 0);
  return dashboardChannelOptions.value.map((item) => {
    const amount = Number(data[item.value]?.amount || 0);
    return {
      key: item.value,
      label: item.label,
      value: amount,
      percent: total ? Math.round((amount / total) * 100) : 0
    };
  });
});
const positiveShareRows = computed(() => shareRows.value.filter((item) => item.value > 0));
const trendChartDescription = computed(() => {
  if (visibleTrendRows.value.length === 0) return '收款趋势图，当前筛选范围暂无数据。';
  const first = visibleTrendRows.value[0];
  const last = visibleTrendRows.value.at(-1);
  const total = visibleTrendRows.value.reduce((sum, item) => sum + Number(item.summary?.total?.[analytics.metric] || 0), 0);
  return `收款趋势图，从${formatPeriodLabel(analytics.dimension, first.period)}到${formatPeriodLabel(analytics.dimension, last.period)}，${analytics.metric === 'amount' ? '合计金额' : '合计人数'}${formatChartValue(total)}。`;
});
const mixChartDescription = computed(() => {
  if (positiveShareRows.value.length === 0) return '渠道占比图，当前筛选范围暂无渠道数据。';
  return `渠道占比图，${positiveShareRows.value.map((item) => `${item.label}${item.percent}%`).join('，')}。`;
});

const filteredRecords = computed(() => {
  const keyword = recordFilters.keyword.trim().toLowerCase();
  return records.value
    .filter((item) => recordFilters.entryMode === 'all' || normalizeEntryMode(item.entryMode) === recordFilters.entryMode)
    .filter((item) => !keyword || [item.remark, item.period, channelText(item.channel)].some((value) => String(value || '').toLowerCase().includes(keyword)));
});

const pagedRecords = computed(() => {
  const start = (pagination.currentPage - 1) * pagination.pageSize;
  return filteredRecords.value.slice(start, start + pagination.pageSize);
});

const recordTotalAmount = computed(() => filteredRecords.value.reduce((total, item) => total + Number(getEffectiveAmount(item) || 0), 0));
const recordTotalPeople = computed(() => filteredRecords.value.reduce((total, item) => total + Number(getEffectivePeople(item) || 0), 0));
const recordAverage = computed(() => (recordTotalPeople.value ? recordTotalAmount.value / recordTotalPeople.value : 0));
const recentRecords = computed(() => [...records.value].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6));

const importPreview = computed(() => buildImportPreview());
const validImportRows = computed(() => importPreview.value.filter((item) => item.errors.length === 0));
const invalidImportRows = computed(() => importPreview.value.filter((item) => item.errors.length > 0));

const usersWithProfiles = computed(() => users.value.map((item) => ({ ...item, profile: userProfile(item.id) })));
const filteredLogs = computed(() => operationLogs.value.filter((item) => {
  const keyword = logFilters.keyword.trim().toLowerCase();
  return (logFilters.userId === 'all' || item.userId === logFilters.userId)
    && (logFilters.action === 'all' || item.action === logFilters.action)
    && (!keyword || String(item.detail || '').toLowerCase().includes(keyword));
}));
const logActionOptions = computed(() => [...new Set(operationLogs.value.map((item) => item.action))]);

const anomalyRows = computed(() => {
  const rows = [];
  const trend = visibleTrendRows.value;
  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  if (latest && previous && previous.summary.total.amount > 0) {
    const drop = (previous.summary.total.amount - latest.summary.total.amount) / previous.summary.total.amount;
    if (drop >= 0.3) {
      rows.push({ key: 'drop', level: 'danger', title: '金额突降', desc: `${formatPeriodLabel(analytics.dimension, latest.period)} 较上一周期下降 ${Math.round(drop * 100)}%` });
    }
  }
  for (const item of dashboardChannelOptions.value) {
    const value = Number(visibleSummary.value[item.value]?.amount || 0);
    if (visibleSummary.value.total.amount > 0 && value === 0) {
      rows.push({ key: `channel-${item.value}`, level: 'warning', title: `${item.label}渠道异常`, desc: '当前周期无收款金额，请确认是否漏录或渠道停用。' });
    }
  }
  if (!records.value.some((item) => item.period === getCurrentPeriod('day'))) {
    rows.push({ key: 'missing-today', level: 'warning', title: '今日尚未录入', desc: '移动端底部按钮可快速补录今日收款。' });
  }
  return rows.length ? rows : [{ key: 'ok', level: 'success', title: '暂无明显异常', desc: '当前周期金额、渠道和录入节奏未发现高风险波动。' }];
});

const rules = {
  granularity: [{ required: true, message: '请选择统计粒度', trigger: 'change' }],
  channel: [{ required: true, message: '请选择收款渠道', trigger: 'change' }],
  period: [
    { required: true, message: '请选择收款日期', trigger: 'change' },
    { validator: validatePeriodRange, trigger: 'change' }
  ],
  amount: [{ required: true, validator: validateAmount, trigger: 'blur' }],
  people: [{ required: true, validator: validatePeople, trigger: 'blur' }]
};

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createSummaryState() {
  return {
    wechat: { amount: 0, people: 0 },
    alipay: { amount: 0, people: 0 },
    cash: { amount: 0, people: 0 },
    other: { amount: 0, people: 0 },
    total: { amount: 0, people: 0 }
  };
}

function assignSummary(target, source = {}) {
  for (const key of ['wechat', 'alipay', 'cash', 'other', 'total']) {
    target[key].amount = Number(source[key]?.amount || 0);
    target[key].people = Number(source[key]?.people || 0);
  }
}

function filterSummaryByChannel(source, channel) {
  const next = createSummaryState();
  if (channel === 'all') {
    assignSummary(next, source);
    return next;
  }
  next[channel] = { amount: Number(source[channel]?.amount || 0), people: Number(source[channel]?.people || 0) };
  next.total = { ...next[channel] };
  return next;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function getCurrentPeriod(granularity) {
  const now = new Date();
  if (granularity === 'year') return String(now.getFullYear());
  if (granularity === 'month') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getParentPeriod(granularity, period) {
  if (!period) return '';
  if (granularity === 'month') return period.slice(0, 4);
  if (granularity === 'day') return period.slice(0, 7);
  return '';
}

function defaultCompareYears() {
  const year = new Date().getFullYear();
  return [String(year - 1), String(year)];
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAverage(value) {
  return Number(value || 0) > 0 ? money(value) : '¥0.00';
}

function formatChartValue(value) {
  const number = Number(value || 0);
  return analytics.metric === 'amount' ? money(number) : `${number} 人`;
}

function averageFromSummary(data) {
  return data?.total?.people ? Number(data.total.amount || 0) / Number(data.total.people || 1) : 0;
}

function buildDeltaNote(current, previous) {
  if (!previous) return '暂无上一周期对比';
  const delta = ((Number(current || 0) - Number(previous || 0)) / Number(previous || 1)) * 100;
  return `${delta >= 0 ? '较上期增长' : '较上期下降'} ${Math.abs(delta).toFixed(1)}%`;
}

function channelText(value) {
  return channelOptions.find((item) => item.value === value)?.label || '未识别';
}

function channelTagClass(value) {
  return channelTagClasses[value] || channelTagClasses.other;
}

function granularityText(value) {
  return value === 'day' ? '日度' : value === 'month' ? '月度' : '年度';
}

function entryModeText(value) {
  return normalizeEntryMode(value) === 'import' ? 'Excel 导入' : '手动';
}

function entryModeTag(value) {
  return normalizeEntryMode(value) === 'import' ? 'warning' : 'success';
}

function normalizeEntryMode(value) {
  return value === 'import' ? 'import' : 'manual';
}

function attachmentText(value) {
  if (value === 'uploaded') return '已上传';
  if (value === 'pending') return '待补充';
  return '无附件';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatPeriodLabel(granularity, period) {
  if (!period) return '-';
  if (granularity === 'year') return `${period} 年`;
  if (granularity === 'month') return `${period.slice(0, 4)} 年 ${Number(period.slice(5, 7))} 月`;
  return `${period.slice(0, 4)} 年 ${Number(period.slice(5, 7))} 月 ${Number(period.slice(8, 10))} 日`;
}

function getEffectiveAmount(item) {
  return item.effectiveAmount ?? item.amount ?? 0;
}

function getEffectivePeople(item) {
  return item.effectivePeople ?? item.people ?? 0;
}

function userProfile(id) {
  if (!userProfiles.value[id]) {
    userProfiles.value[id] = { role: id === DEFAULT_USER_ID ? 'admin' : 'clerk', status: 'enabled' };
  }
  return userProfiles.value[id];
}

function userDisplayName(user) {
  const profile = userProfile(user.id);
  return `${user.name} · ${roleText(profile.role)}${profile.status === 'disabled' ? '（禁用）' : ''}`;
}

function userInitial(user) {
  return Array.from(String(user?.name || '用户').trim())[0] || '用';
}

function roleText(role) {
  if (role === 'admin') return '管理员';
  if (role === 'manager') return '老板/店长';
  return '店员';
}

function roleScopeText(role) {
  if (role === 'admin') return '用户管理、系统配置、全部数据';
  if (role === 'manager') return '录入、查看、导出授权数据';
  return '录入与查看授权范围数据';
}

function isRecordSelected(id) {
  return selectedRows.value.some((item) => item.id === id);
}

function toggleRecordSelection(item, checked) {
  if (checked && !isRecordSelected(item.id)) selectedRows.value = [...selectedRows.value, item];
  if (!checked) selectedRows.value = selectedRows.value.filter((row) => row.id !== item.id);
}

function saveUserProfiles() {
  writeJson(USER_PROFILE_KEY, userProfiles.value);
  addOperationLog('权限变更', '更新用户角色或启停状态');
}

function saveSettings() {
  writeJson(SETTINGS_KEY, settings);
  if (analytics.channel !== 'all' && !settings.channels[analytics.channel]) analytics.channel = 'all';
  if (recordFilters.channel !== 'all' && !settings.channels[recordFilters.channel]) recordFilters.channel = 'all';
  if (importWizard.uniformChannel && !settings.channels[importWizard.uniformChannel]) {
    importWizard.uniformChannel = enabledChannelOptions.value[0]?.value || 'wechat';
  }
  if (!settings.channels[form.channel]) form.channel = enabledChannelOptions.value[0]?.value || 'wechat';
  nextTick(renderCharts);
  settingsSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  addOperationLog('系统配置', '更新渠道、门店或默认统计口径');
}

function handleDefaultRangeSettingChange(nextValue) {
  saveSettings();
  analytics.range = nextValue;
  handleAnalyticsRangeChange(nextValue);
}

function switchView(view) {
  activeView.value = view;
  window.location.hash = view;
  nextTick(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (view === 'dashboard') requestAnimationFrame(renderCharts);
  });
}

function openCreate() {
  resetFormForCreate();
  switchView('record');
}

function resetFormForCreate() {
  editingId.value = '';
  Object.assign(form, {
    granularity: recordFilters.granularity || 'day',
    channel: enabledChannelOptions.value[0]?.value || 'wechat',
    period: getCurrentPeriod(recordFilters.granularity || 'day'),
    amount: null,
    people: null,
    remark: '',
    attachmentStatus: 'none'
  });
  nextTick(() => formRef.value?.clearValidate());
}

function handleFormGranularityChange(nextValue) {
  form.period = getCurrentPeriod(nextValue);
}

function handleRecordGranularityChange(nextValue) {
  recordFallbackNotice.value = '';
  recordFilters.period = nextValue === 'month' ? getCurrentPeriod('year') : getCurrentPeriod('month');
  refreshRecords();
}

function refreshRecordsFromFilter() {
  recordFallbackNotice.value = '';
  refreshRecords();
}

function handleAnalyticsDimensionChange(nextValue) {
  analytics.range = 'current';
  analyticsFallbackNotice.value = '';
  analytics.period = getCurrentPeriod(nextValue);
  if (nextValue === 'year' && analytics.years.length === 0) analytics.years = defaultCompareYears();
  refreshAnalytics();
}

function refreshAnalyticsFromFilter() {
  analyticsFallbackNotice.value = '';
  refreshAnalytics();
}

function handleAnalyticsRangeChange(nextValue) {
  analyticsFallbackNotice.value = '';
  analyticsInitialLoad.value = true;
  if (nextValue === 'last7') {
    analytics.dimension = 'day';
    analytics.period = getCurrentPeriod('day');
  } else if (nextValue === 'last12') {
    analytics.dimension = 'month';
    analytics.period = getCurrentPeriod('month');
  } else {
    analytics.dimension = settings.defaultDimension || 'month';
    analytics.period = getCurrentPeriod(analytics.dimension);
  }
  refreshAnalytics();
}

function handleYearSelectionChange() {
  analyticsFallbackNotice.value = '';
  if (analytics.years.length === 0) analytics.years = defaultCompareYears();
  analytics.period = analytics.years[analytics.years.length - 1] || getCurrentPeriod('year');
  refreshAnalytics();
}

function validateAmount(rule, value, callback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) callback(new Error('金额必须大于 0'));
  else callback();
}

function validatePeople(rule, value, callback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) callback(new Error('人数不可为负'));
  else callback();
}

function validatePeriodRange(rule, value, callback) {
  if (!isPeriodInRange(form.granularity, value)) callback(new Error('日期不可早于 2020 年或晚于今天'));
  else callback();
}

function isPeriodInRange(granularity, period) {
  if (!period) return false;
  const min = '2020-01-01';
  const max = getCurrentPeriod('day');
  const normalized = granularity === 'month' ? `${period}-01` : period;
  return normalized >= min && normalized <= max;
}

async function loadUsers() {
  try {
    const list = await userApi.list();
    users.value = Array.isArray(list) ? list : [];
  } catch (error) {
    users.value = [{ id: DEFAULT_USER_ID, name: '管理员', role: 'admin' }];
    ElMessage.error(error.message || '加载用户失败');
  }

  const firstEnabledId = users.value.find((item) => userProfile(item.id).status !== 'disabled')?.id || DEFAULT_USER_ID;
  if (isLoggedIn.value) {
    if (!users.value.some((item) => item.id === currentUserId.value && userProfile(item.id).status !== 'disabled')) {
      currentUserId.value = firstEnabledId;
    }
    setActiveUserId(currentUserId.value);
  }
}

async function login() {
  if (!authForm.account.trim() || !authForm.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }

  loginLoading.value = true;
  try {
    const user = await userApi.login({
      account: authForm.account.trim(),
      password: authForm.password
    });
    currentUserId.value = user.id;
    isLoggedIn.value = true;
    analyticsInitialLoad.value = true;
    recordsInitialLoad.value = true;
    analyticsFallbackNotice.value = '';
    recordFallbackNotice.value = '';
    setActiveUserId(user.id);
    localStorage.setItem(USER_STORAGE_KEY, user.id);
    addOperationLog('登录', `用户 ${user.name} 登录系统`);
    await refreshAll();
    ElMessage.success('登录成功');
  } catch (error) {
    ElMessage.error(error.message || '登录失败');
  } finally {
    loginLoading.value = false;
  }
}

async function register() {
  const name = authForm.account.trim();
  if (!name || !authForm.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  if (authForm.password.length < 6) {
    ElMessage.warning('密码至少 6 位');
    return;
  }
  if (authForm.password !== authForm.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致');
    return;
  }

  loginLoading.value = true;
  try {
    const user = await userApi.create({ name, password: authForm.password });
    await loadUsers();
    currentUserId.value = user.id;
    isLoggedIn.value = true;
    analyticsInitialLoad.value = true;
    recordsInitialLoad.value = true;
    analyticsFallbackNotice.value = '';
    recordFallbackNotice.value = '';
    setActiveUserId(user.id);
    localStorage.setItem(USER_STORAGE_KEY, user.id);
    userProfile(user.id).role = 'clerk';
    userProfile(user.id).status = 'enabled';
    saveUserProfiles();
    addOperationLog('注册', `用户 ${user.name} 注册并登录系统`);
    await refreshAll();
    ElMessage.success('注册成功');
  } catch (error) {
    ElMessage.error(error.message || '注册失败');
  } finally {
    loginLoading.value = false;
  }
}

function logout() {
  addOperationLog('注销', `用户 ${users.value.find((item) => item.id === currentUserId.value)?.name || currentUserId.value} 注销系统`);
  isLoggedIn.value = false;
  currentUserId.value = '';
  authMode.value = 'login';
  authForm.password = '';
  authForm.confirmPassword = '';
  setActiveUserId('');
  localStorage.removeItem(USER_STORAGE_KEY);
  records.value = [];
  trendRows.value = [];
  selectedRows.value = [];
  trendChart?.dispose();
  mixChart?.dispose();
  trendChart = null;
  mixChart = null;
  ElMessage.success('已注销');
}

async function handleUserChange(userId) {
  if (!userId) return;
  currentUserId.value = userId;
  analyticsInitialLoad.value = true;
  recordsInitialLoad.value = true;
  analyticsFallbackNotice.value = '';
  recordFallbackNotice.value = '';
  setActiveUserId(currentUserId.value);
  localStorage.setItem(USER_STORAGE_KEY, currentUserId.value);
  addOperationLog('登录/切换', `切换到用户 ${users.value.find((item) => item.id === currentUserId.value)?.name || currentUserId.value}`);
  await refreshAll();
}

async function createUser() {
  const name = userForm.name.trim();
  if (!name) {
    ElMessage.warning('请输入用户名称');
    return;
  }

  userSaving.value = true;
  try {
    const user = await userApi.create({ name, password: '123456' });
    userProfile(user.id).role = 'clerk';
    userProfile(user.id).status = 'enabled';
    saveUserProfiles();
    await loadUsers();
    userDialogVisible.value = false;
    userForm.name = '';
    addOperationLog('新增用户', `新增用户 ${user.name}`);
    ElMessage.success('新增用户成功');
  } catch (error) {
    ElMessage.error(error.message || '新增用户失败');
  } finally {
    userSaving.value = false;
  }
}

function openUserDialog() {
  userForm.name = '';
  userDialogVisible.value = true;
}

function shiftPeriod(period, offset, dimension) {
  const date = dimension === 'month'
    ? new Date(`${period}-01T00:00:00`)
    : new Date(`${period}T00:00:00`);
  if (dimension === 'month') date.setMonth(date.getMonth() + offset);
  else date.setDate(date.getDate() + offset);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return dimension === 'month' ? day.slice(0, 7) : day;
}

function buildPeriodSequence(endPeriod, count, dimension) {
  return Array.from({ length: count }, (_, index) => shiftPeriod(endPeriod, index - count + 1, dimension));
}

function summarizeTrendRows(rows) {
  const next = createSummaryState();
  for (const row of rows) {
    for (const channel of channelOptions.map((item) => item.value)) {
      next[channel].amount += Number(row.summary?.[channel]?.amount || 0);
      next[channel].people += Number(row.summary?.[channel]?.people || 0);
    }
  }
  next.total.amount = channelOptions.reduce((total, item) => total + next[item.value].amount, 0);
  next.total.people = channelOptions.reduce((total, item) => total + next[item.value].people, 0);
  return next;
}

function completeTrendRange(sourceRows, periods) {
  const byPeriod = new Map(sourceRows.map((item) => [item.period, item]));
  return periods.map((period) => byPeriod.get(period) || { period, summary: createSummaryState() });
}

function latestDataPeriod(rows) {
  return [...rows]
    .filter((item) => Number(item.summary?.total?.amount || 0) > 0 || Number(item.summary?.total?.people || 0) > 0)
    .sort((left, right) => String(right.period).localeCompare(String(left.period)))[0]?.period || '';
}

async function refreshAll() {
  if (!isLoggedIn.value) return;
  await Promise.all([refreshAnalytics(), refreshRecords()]);
}

async function refreshAnalytics() {
  if (!isLoggedIn.value) return;
  analyticsLoading.value = true;
  try {
    if (analytics.range !== 'current') {
      const count = analytics.range === 'last7' ? 7 : 12;
      const dimension = analytics.range === 'last7' ? 'day' : 'month';
      const rawTrend = await receiptApi.trend({ dimension });
      const allTrend = Array.isArray(rawTrend) ? rawTrend : [];
      let endPeriod = getCurrentPeriod(dimension);
      let currentRows = completeTrendRange(allTrend, buildPeriodSequence(endPeriod, count, dimension));
      if (analyticsInitialLoad.value && summarizeTrendRows(currentRows).total.amount === 0) {
        const latest = latestDataPeriod(allTrend);
        if (latest) {
          endPeriod = latest;
          currentRows = completeTrendRange(allTrend, buildPeriodSequence(endPeriod, count, dimension));
          analyticsFallbackNotice.value = `当前范围暂无数据，已展示截至 ${formatPeriodLabel(dimension, latest)} 的最近数据。`;
        }
      }
      const previousEnd = shiftPeriod(buildPeriodSequence(endPeriod, count, dimension)[0], -1, dimension);
      const previousRows = completeTrendRange(allTrend, buildPeriodSequence(previousEnd, count, dimension));
      analytics.dimension = dimension;
      analytics.period = endPeriod;
      trendRows.value = currentRows;
      assignSummary(summary, summarizeTrendRows(currentRows));
      assignSummary(compareSummary, summarizeTrendRows(previousRows));
    } else if (analytics.dimension === 'year') {
      const rawTrend = await receiptApi.trend({ dimension: 'year' });
      const allTrend = Array.isArray(rawTrend) ? rawTrend : [];
      let years = analytics.years.length ? analytics.years : defaultCompareYears();
      if (analyticsInitialLoad.value) {
        const currentRow = allTrend.find((item) => item.period === getCurrentPeriod('year'));
        const latest = latestDataPeriod(allTrend);
        if (!Number(currentRow?.summary?.total?.amount || 0) && latest && latest !== getCurrentPeriod('year')) {
          years = [String(Number(latest) - 1), latest];
          analytics.years = years;
          analytics.period = latest;
          analyticsFallbackNotice.value = `本年暂无数据，已展示最近有数据的 ${latest} 年。`;
        }
      }
      const summaryResults = await Promise.all(years.map((year) => receiptApi.summary({ dimension: 'year', period: year })));
      yearCompareSummaries.value = years.map((year, index) => ({ period: year, summary: summaryResults[index]?.summary || createSummaryState() }));
      trendRows.value = allTrend.filter((item) => years.includes(item.period));
      const current = yearCompareSummaries.value.find((item) => item.period === analytics.period) || yearCompareSummaries.value.at(-1);
      const previous = yearCompareSummaries.value.find((item) => item.period === String(Number(current?.period || 0) - 1)) || yearCompareSummaries.value[0];
      assignSummary(summary, current?.summary);
      assignSummary(compareSummary, previous?.summary);
    } else {
      let [summaryData, compareData, trendData] = await Promise.all([
        receiptApi.summary({ dimension: analytics.dimension, period: analytics.period }),
        receiptApi.summary({ dimension: analytics.dimension, period: comparePeriod(analytics.dimension, analytics.period) }),
        receiptApi.trend({ dimension: analytics.dimension, parentPeriod: getParentPeriod(analytics.dimension, analytics.period) || undefined })
      ]);
      if (analyticsInitialLoad.value && Number(summaryData.summary?.total?.amount || 0) === 0) {
        const allTrend = await receiptApi.trend({ dimension: analytics.dimension });
        const latest = latestDataPeriod(Array.isArray(allTrend) ? allTrend : []);
        if (latest && latest !== analytics.period) {
          analytics.period = latest;
          analyticsFallbackNotice.value = `当前周期暂无数据，已展示最近有数据的 ${formatPeriodLabel(analytics.dimension, latest)}。`;
          [summaryData, compareData, trendData] = await Promise.all([
            receiptApi.summary({ dimension: analytics.dimension, period: latest }),
            receiptApi.summary({ dimension: analytics.dimension, period: comparePeriod(analytics.dimension, latest) }),
            receiptApi.trend({ dimension: analytics.dimension, parentPeriod: getParentPeriod(analytics.dimension, latest) || undefined })
          ]);
        }
      }
      assignSummary(summary, summaryData.summary);
      assignSummary(compareSummary, compareData.summary);
      trendRows.value = Array.isArray(trendData) ? trendData : [];
    }
    const [todaySummary, monthSummary, yearSummary] = await Promise.all([
      receiptApi.summary({ dimension: 'day', period: getCurrentPeriod('day') }),
      receiptApi.summary({ dimension: 'month', period: getCurrentPeriod('month') }),
      receiptApi.summary({ dimension: 'year', period: getCurrentPeriod('year') })
    ]);
    assignSummary(coreSummary.today, todaySummary.summary);
    assignSummary(coreSummary.month, monthSummary.summary);
    assignSummary(coreSummary.year, yearSummary.summary);
    await nextTick();
    renderCharts();
  } catch (error) {
    ElMessage.error(error.message || '刷新统计失败');
  } finally {
    analyticsInitialLoad.value = false;
    analyticsLoading.value = false;
  }
}

function comparePeriod(dimension, period) {
  if (dimension === 'year') return String(Number(period) - 1);
  const date = new Date(`${period}${dimension === 'month' ? '-01' : ''}T00:00:00`);
  if (Number.isNaN(date.getTime())) return getCurrentPeriod(dimension);
  if (dimension === 'month') {
    date.setMonth(date.getMonth() - 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function refreshRecords() {
  if (!isLoggedIn.value) return;
  recordsLoading.value = true;
  try {
    let list = await receiptApi.list({
      granularity: recordFilters.granularity,
      parentPeriod: recordFilters.period || undefined,
      channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
    });
    if (recordsInitialLoad.value && (!Array.isArray(list) || list.length === 0)) {
      let fallbackGranularity = recordFilters.granularity;
      let allRecords = await receiptApi.list({
        granularity: fallbackGranularity,
        channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
      });
      if ((!Array.isArray(allRecords) || allRecords.length === 0) && fallbackGranularity === 'day') {
        fallbackGranularity = 'month';
        allRecords = await receiptApi.list({
          granularity: fallbackGranularity,
          channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
        });
      }
      const latest = [...(Array.isArray(allRecords) ? allRecords : [])].sort((left, right) => String(right.period).localeCompare(String(left.period)))[0];
      if (latest) {
        recordFilters.granularity = fallbackGranularity;
        recordFilters.period = getParentPeriod(fallbackGranularity, latest.period);
        list = await receiptApi.list({
          granularity: fallbackGranularity,
          parentPeriod: recordFilters.period,
          channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
        });
        recordFallbackNotice.value = `当前周期暂无记录，已展示最近有数据的${recordFilterPeriodLabel.value}：${recordFilters.period}。`;
      }
    }
    records.value = Array.isArray(list) ? list : [];
    pagination.currentPage = 1;
    selectedRows.value = [];
  } catch (error) {
    ElMessage.error(error.message || '刷新台账失败');
  } finally {
    recordsInitialLoad.value = false;
    recordsLoading.value = false;
  }
}

async function submitForm(continueAfterSave) {
  await formRef.value.validate();
  saving.value = true;
  const payload = {
    channel: form.channel,
    granularity: form.granularity,
    period: form.period,
    amount: Number(form.amount),
    people: Number(form.people),
    remark: form.remark.trim(),
    attachmentStatus: form.attachmentStatus,
    entryMode: 'manual'
  };

  try {
    if (editingId.value) {
      await receiptApi.update(editingId.value, payload);
      addOperationLog('编辑收款', `${channelText(payload.channel)} ${payload.period} ${money(payload.amount)}`);
      ElMessage.success('修改成功');
    } else {
      await receiptApi.create(payload);
      addOperationLog('新增收款', `${channelText(payload.channel)} ${payload.period} ${money(payload.amount)}`);
      ElMessage.success('新增成功');
    }
    localStorage.removeItem(DRAFT_KEY);
    draftSavedAt.value = '';
    recordFilters.granularity = payload.granularity;
    recordFilters.period = getParentPeriod(payload.granularity, payload.period);
    await refreshAll();
    if (continueAfterSave) resetFormForCreate();
    else switchView('ledger');
  } catch (error) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function startEdit(item) {
  editingId.value = item.id;
  Object.assign(form, {
    granularity: item.granularity,
    channel: item.channel,
    period: item.period,
    amount: Number(item.amount),
    people: Number(item.people),
    remark: item.remark || '',
    attachmentStatus: item.attachmentStatus || 'none'
  });
  switchView('record');
  nextTick(() => formRef.value?.clearValidate());
}

async function deleteItem(id) {
  try {
    await receiptApi.remove(id);
    addOperationLog('删除收款', `删除记录 ${id}`);
    ElMessage.success('删除成功');
    await refreshAll();
  } catch (error) {
    ElMessage.error(error.message || '删除失败');
  }
}

function exportRows(rows, filename, sheetName = '收款台账') {
  if (rows.length === 0) {
    ElMessage.warning('没有可导出的数据');
    return;
  }
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function recordExportPayload(sourceRows) {
  return sourceRows.map((item) => ({
    收款日期: formatPeriodLabel(item.granularity, item.period),
    统计粒度: granularityText(item.granularity),
    收款渠道: channelText(item.channel),
    收款金额: Number(getEffectiveAmount(item) || 0),
    收款人数: Number(getEffectivePeople(item) || 0),
    客单价: Number(getEffectivePeople(item)) ? Number(getEffectiveAmount(item)) / Number(getEffectivePeople(item)) : 0,
    录入方式: entryModeText(item.entryMode),
    备注: item.remark || '',
    附件状态: attachmentText(item.attachmentStatus),
    创建时间: formatDateTime(item.createdAt),
    更新时间: formatDateTime(item.updatedAt)
  }));
}

function exportRecords() {
  exportRows(recordExportPayload(filteredRecords.value), `收款台账_${Date.now()}.xlsx`);
  addOperationLog('导出', `导出当前筛选 ${filteredRecords.value.length} 条`);
}

function exportSelected() {
  exportRows(recordExportPayload(selectedRows.value), `收款台账_选中_${Date.now()}.xlsx`);
  addOperationLog('导出', `导出选中 ${selectedRows.value.length} 条`);
}

function exportDashboard() {
  const rows = [
    { 指标: '当前周期金额', 值: visibleSummary.value.total.amount },
    { 指标: '当前周期人数', 值: visibleSummary.value.total.people },
    { 指标: '当前客单价', 值: averageFromSummary(visibleSummary.value) },
    ...dashboardChannelOptions.value.map((item) => ({
      指标: `${item.label}金额`,
      值: visibleSummary.value[item.value]?.amount || 0
    }))
  ];
  exportRows(rows, `经营看板_${analytics.dimension}_${Date.now()}.xlsx`, '经营看板');
  addOperationLog('导出', '导出看板汇总报表');
}

function triggerImport() {
  importInput.value?.click();
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
    importWizard.rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    validateImportRows();
    addOperationLog('导入预校验', `上传文件 ${file.name}，解析 ${Math.max(importWizard.rawRows.length - 1, 0)} 行`);
    ElMessage.success('文件解析完成，请确认预校验结果');
  } catch (error) {
    ElMessage.error(error.message || '文件解析失败');
  } finally {
    importing.value = false;
  }
}

function validateImportRows() {
  // Computed preview recalculates automatically; this method exists for control events.
}

function buildImportPreview() {
  const rows = importWizard.rawRows || [];
  if (rows.length === 0) return [];
  const headers = rows[0].map(cellText);
  const index = {
    period: findHeader(headers, ['收款日期', '日期', '月份', '周期', 'period', 'date']),
    granularity: findHeader(headers, ['统计粒度', '粒度', 'granularity']),
    channel: findHeader(headers, ['收款渠道', '渠道', 'channel']),
    amount: findHeader(headers, ['收款金额', '金额', 'amount']),
    people: findHeader(headers, ['收款人数', '人数', 'people', 'count']),
    remark: findHeader(headers, ['备注', '异常说明', 'remark', 'note'])
  };
  const hasHeader = Object.values(index).some((value) => value !== -1);
  const fallback = { period: 0, granularity: 1, channel: 2, amount: 3, people: 4, remark: 5 };
  const use = Object.fromEntries(Object.entries(index).map(([key, value]) => [key, value === -1 ? fallback[key] : value]));
  const seen = new Set();

  return rows.slice(hasHeader ? 1 : 0)
    .filter((row) => row.some((cell) => cellText(cell)))
    .map((row, offset) => {
      const sourceChannel = importWizard.channelMode === 'uniform' ? importWizard.uniformChannel : normalizeChannelText(row[use.channel]);
      const granularity = normalizeGranularityText(row[use.granularity], row[use.period]);
      const period = normalizeImportPeriod(row[use.period], granularity);
      const amount = Number(row[use.amount]);
      const people = Number(row[use.people]);
      const key = `${granularity}-${sourceChannel}-${period}`;
      const errors = [];

      if (!period) errors.push('非法日期');
      if (!sourceChannel) errors.push('渠道缺失');
      if (!Number.isFinite(amount) || amount <= 0) errors.push('空金额');
      if (!Number.isInteger(people) || people < 0) errors.push('人数非法');
      if (seen.has(key)) errors.push('重复记录');
      seen.add(key);

      return {
        rowNumber: offset + (hasHeader ? 2 : 1),
        granularity,
        channel: sourceChannel,
        period,
        amount,
        people,
        remark: cellText(row[use.remark]),
        entryMode: 'import',
        attachmentStatus: 'none',
        errors
      };
    });
}

function findHeader(headers, names) {
  return headers.findIndex((header) => names.some((name) => header.toLowerCase() === String(name).toLowerCase()));
}

function cellText(value) {
  return String(value ?? '').trim();
}

function normalizeChannelText(value) {
  const text = cellText(value).toLowerCase();
  const matched = channelOptions.find((item) => [item.value, item.label.toLowerCase()].includes(text));
  return matched?.value || '';
}

function normalizeGranularityText(value, periodValue) {
  const text = cellText(value);
  if (/日|day/i.test(text)) return 'day';
  if (/月|month/i.test(text)) return 'month';
  const periodText = cellText(periodValue);
  return /\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(periodText) ? 'day' : 'month';
}

function normalizeImportPeriod(value, granularity) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    return granularity === 'day' ? day : day.slice(0, 7);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) {
      const day = `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d || 1)}`;
      return granularity === 'day' ? day : day.slice(0, 7);
    }
  }
  const text = cellText(value).replace(/[年月]/g, '-').replace(/[日]/g, '');
  const matched = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (!matched) return '';
  const month = Number(matched[2]);
  const day = Number(matched[3] || 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const normalized = `${matched[1]}-${pad(month)}-${pad(day)}`;
  return granularity === 'day' ? normalized : normalized.slice(0, 7);
}

async function importValidRows() {
  importing.value = true;
  try {
    const rows = validImportRows.value.map(({ errors, rowNumber, ...row }) => row);
    const result = await receiptApi.importRows({ rows });
    addOperationLog('导入', `成功 ${result.created || 0} 条，更新 ${result.updated || 0} 条，失败 ${invalidImportRows.value.length} 条`);
    ElMessage.success(`导入完成：成功 ${result.created || 0} 条，更新 ${result.updated || 0} 条，异常 ${invalidImportRows.value.length} 条`);
    recordFilters.granularity = rows.some((item) => item.granularity === 'day') ? 'day' : 'month';
    recordFilters.period = recordFilters.granularity === 'day' ? getCurrentPeriod('month') : getCurrentPeriod('year');
    importWizard.rawRows = [];
    await refreshAll();
    switchView('ledger');
  } catch (error) {
    ElMessage.error(error.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function addOperationLog(action, detail) {
  const user = users.value.find((item) => item.id === currentUserId.value);
  operationLogs.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    detail,
    userId: currentUserId.value,
    userName: user?.name || currentUserId.value,
    time: new Date().toISOString()
  });
  operationLogs.value = operationLogs.value.slice(0, 500);
  writeJson(LOG_KEY, operationLogs.value);
}

function renderCharts() {
  if (activeView.value !== 'dashboard') return;
  renderTrendChart();
  renderMixChart();
}

function ensureChartInstance(instance, element) {
  if (!element) return null;
  if (!element.clientWidth || !element.clientHeight) {
    requestAnimationFrame(renderCharts);
    return null;
  }
  if (!instance || instance.getDom() !== element) {
    instance?.dispose();
    return echarts.init(element);
  }
  return instance;
}

function renderTrendChart() {
  const element = trendChartRef.value;
  if (!element) return;
  trendChart = ensureChartInstance(trendChart, element);
  if (!trendChart) return;
  const unit = analytics.metric === 'amount' ? '元' : '人';
  const rows = visibleTrendRows.value;
  const singlePoint = rows.length <= 1;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const seriesFor = (channel) => rows.map((item) => Number(item.summary?.[channel]?.[analytics.metric] || 0));
  trendChart.setOption({
    aria: { enabled: true, description: trendChartDescription.value },
    color: ['#0f766e', '#2563eb', '#f97316', '#7c3aed', '#111827'],
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${value}${unit}` },
    graphic: rows.length
      ? []
      : [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无趋势数据', fill: '#667789', fontSize: 14 } }],
    legend: { type: 'scroll', top: 0, data: [...dashboardChannelOptions.value.map((item) => item.label), '合计'] },
    grid: { top: 52, left: mobile ? 4 : 12, right: mobile ? 8 : 18, bottom: 14, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: singlePoint,
      axisLabel: {
        formatter: (value) => {
          if (analytics.dimension === 'month') return value.slice(5);
          if (analytics.dimension === 'day') return value.slice(8);
          return value;
        }
      },
      data: rows.map((item) => item.period)
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value) => mobile && value >= 10000 ? `${Math.round(value / 1000)}k` : `${value}${unit}` }
    },
    series: [
      ...dashboardChannelOptions.value.map((item) => ({
        name: item.label,
        type: singlePoint ? 'bar' : 'line',
        smooth: !singlePoint,
        barMaxWidth: 28,
        data: seriesFor(item.value)
      })),
      {
        name: '合计',
        type: singlePoint ? 'bar' : 'line',
        smooth: !singlePoint,
        barMaxWidth: 34,
        lineStyle: { type: 'dashed', width: 3 },
        label: { show: singlePoint, position: 'top', formatter: ({ value }) => `${value}${unit}` },
        data: rows.map((item) => Number(item.summary?.total?.[analytics.metric] || 0))
      }
    ]
  }, true);
  trendChart.resize();
}

function renderMixChart() {
  const element = mixChartRef.value;
  if (!element) return;
  mixChart = ensureChartInstance(mixChart, element);
  if (!mixChart) return;
  const chartRows = positiveShareRows.value;
  const total = chartRows.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  mixChart.setOption({
    aria: { enabled: true, description: mixChartDescription.value },
    color: ['#0f766e', '#2563eb', '#f97316', '#7c3aed'],
    tooltip: { trigger: 'item' },
    graphic: total
      ? []
      : [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无渠道数据', fill: '#667789', fontSize: 14 } }],
    series: total
      ? [{
          type: 'pie',
          radius: ['48%', '72%'],
          avoidLabelOverlap: true,
          label: { show: !mobile, formatter: '{b}\n{d}%' },
          labelLine: { show: !mobile },
          data: chartRows.map((item) => ({ name: item.label, value: item.value }))
        }]
      : []
  }, true);
  mixChart.resize();
}

function resizeCharts() {
  trendChart?.resize();
  mixChart?.resize();
}

watch(
  () => [form.granularity, form.channel, form.period, form.amount, form.people, form.remark, form.attachmentStatus],
  () => {
    if (!editingId.value) {
      writeJson(DRAFT_KEY, form);
      draftSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    }
  },
  { deep: true }
);

watch(
  () => filteredRecords.value.length,
  () => {
    const maxPage = Math.max(1, Math.ceil(filteredRecords.value.length / pagination.pageSize));
    if (pagination.currentPage > maxPage) pagination.currentPage = maxPage;
  }
);

watch(
  () => [analytics.channel, analytics.metric],
  () => renderCharts()
);

onMounted(async () => {
  const hashView = window.location.hash.replace('#', '');
  if (navItems.some((item) => item.value === hashView)) activeView.value = hashView;
  const savedDraft = readJson(DRAFT_KEY, null);
  if (savedDraft) {
    Object.assign(form, savedDraft);
    draftSavedAt.value = '已恢复';
  }
  await loadUsers();
  if (isLoggedIn.value) {
    setActiveUserId(currentUserId.value);
    await refreshAll();
  } else {
    setActiveUserId('');
  }
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts);
  trendChart?.dispose();
  mixChart?.dispose();
});
</script>
