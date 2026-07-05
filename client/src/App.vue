<template>
  <div class="app-shell">
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
          :class="{ active: activeView === item.value }"
          @click="switchView(item.value)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <small>{{ item.shortLabel }}</small>
        </button>
      </nav>

      <div class="current-user">
        <span>当前用户</span>
        <el-select v-model="currentUserId" class="full-control" size="large" @change="handleUserChange">
          <el-option
            v-for="item in users"
            :key="item.id"
            :label="userDisplayName(item)"
            :value="item.id"
            :disabled="userProfile(item.id).status === 'disabled'"
          />
        </el-select>
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
            <div class="filter-row">
              <div class="field">
                <label>统计粒度</label>
                <el-segmented v-model="analytics.dimension" :options="analyticsGranularityOptions" @change="handleAnalyticsDimensionChange" />
              </div>
              <div class="field">
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
                  @change="refreshAnalytics"
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
              <div class="field">
                <label>渠道</label>
                <el-select v-model="analytics.channel" class="full-control" @change="refreshAnalytics">
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
              <div ref="trendChartRef" class="chart-box"></div>
            </article>

            <article class="panel">
              <div class="panel-heading">
                <div>
                  <span class="eyebrow">Mix</span>
                  <h2>渠道占比</h2>
                </div>
              </div>
              <div ref="mixChartRef" class="mix-chart"></div>
              <div class="mix-list">
                <div v-for="item in shareRows" :key="item.key" class="mix-row">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.percent }}%</strong>
                </div>
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
                  @change="refreshRecords"
                />
              </div>
              <div class="field">
                <label>渠道</label>
                <el-select v-model="recordFilters.channel" class="full-control" @change="refreshRecords">
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
                <template #default="{ row }"><el-tag>{{ channelText(row.channel) }}</el-tag></template>
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
              <el-table-column label="操作" width="128" fixed="right">
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
                    <strong>{{ money(getEffectiveAmount(item)) }}</strong>
                    <el-tag>{{ channelText(item.channel) }}</el-tag>
                  </div>
                  <span>{{ formatPeriodLabel(item.granularity, item.period) }} · {{ granularityText(item.granularity) }} · {{ entryModeText(item.entryMode) }}</span>
                  <p v-if="item.remark">{{ item.remark }}</p>
                </div>
                <div class="record-card-actions">
                  <el-button text type="primary" @click="startEdit(item)">编辑</el-button>
                  <el-popconfirm title="确认删除这条记录吗？" @confirm="deleteItem(item.id)">
                    <template #reference><el-button text type="danger">删除</el-button></template>
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
            <div class="form-actions">
              <el-button @click="resetFormForCreate">清空</el-button>
              <el-button :loading="saving" @click="submitForm(false)">保存</el-button>
              <el-button type="primary" :loading="saving" @click="submitForm(true)">保存并继续</el-button>
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

            <el-table :data="importPreview" border stripe max-height="420" class="import-table">
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

            <div class="form-actions">
              <el-button @click="exportRecords">导出当前筛选结果</el-button>
              <el-button @click="exportDashboard">导出看板汇总报表</el-button>
              <el-button type="primary" :disabled="validImportRows.length === 0" :loading="importing" @click="importValidRows">
                只导入通过校验的数据
              </el-button>
            </div>
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
            <el-table :data="usersWithProfiles" border stripe>
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
              <el-table-column label="状态" width="130">
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
            <el-table :data="filteredLogs" border stripe>
              <el-table-column prop="time" label="时间" min-width="160">
                <template #default="{ row }">{{ formatDateTime(row.time) }}</template>
              </el-table-column>
              <el-table-column prop="userName" label="操作人" width="120" />
              <el-table-column prop="action" label="操作" width="120" />
              <el-table-column prop="detail" label="变更内容" min-width="260" show-overflow-tooltip />
            </el-table>
          </section>
        </section>

        <section v-if="activeView === 'settings'" class="settings-grid">
          <section class="panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Channels</span>
                <h2>渠道配置</h2>
              </div>
            </div>
            <div class="setting-list">
              <div v-for="item in channelOptions" :key="item.value" class="setting-row">
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.value }}</span>
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
                <el-select v-model="settings.defaultRange" class="full-control" @change="saveSettings">
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

    <button type="button" class="mobile-fab" @click="openCreate">
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
  Plus,
  Refresh,
  Search,
  Setting,
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

const navItems = [
  { value: 'dashboard', label: '经营看板', shortLabel: '看板', kicker: 'Dashboard', title: '首页 / 经营看板', desc: '10 秒内看懂今日、本月、本年的收款表现。', icon: DataAnalysis },
  { value: 'ledger', label: '收款台账', shortLabel: '台账', kicker: 'Ledger', title: '收款台账', desc: '集中筛选、修改、删除和导出所有收款记录。', icon: Tickets },
  { value: 'record', label: '新建/编辑', shortLabel: '录入', kicker: 'Entry', title: '新建 / 编辑收款', desc: '服务高频录入，支持保存并继续和草稿自动保存。', icon: Edit },
  { value: 'import', label: '导入导出', shortLabel: '导入', kicker: 'Excel', title: '批量导入导出', desc: '先预校验，再确认字段映射和渠道规则。', icon: Upload },
  { value: 'users', label: '用户权限', shortLabel: '用户', kicker: 'Access', title: '用户与权限', desc: '管理多人使用、角色分级和启停状态。', icon: User },
  { value: 'logs', label: '操作日志', shortLabel: '日志', kicker: 'Audit', title: '操作日志', desc: '追踪新增、编辑、删除、导入、导出和登录行为。', icon: Files },
  { value: 'settings', label: '系统配置', shortLabel: '配置', kicker: 'Settings', title: '系统配置', desc: '配置渠道、门店、统计口径和导入字段。', icon: Setting }
];

const analyticsGranularityOptions = [
  { label: '年', value: 'year' },
  { label: '月', value: 'month' },
  { label: '日', value: 'day' }
];

const entryGranularityOptions = [
  { label: '日度', value: 'day' },
  { label: '月度', value: 'month' }
];

const metricOptions = [
  { label: '金额', value: 'amount' },
  { label: '人数', value: 'people' }
];

const activeView = ref('dashboard');
const currentUserId = ref(localStorage.getItem(USER_STORAGE_KEY) || DEFAULT_USER_ID);
const users = ref([]);
const records = ref([]);
const trendRows = ref([]);
const yearCompareSummaries = ref([]);
const selectedRows = ref([]);
const operationLogs = ref(readJson(LOG_KEY, []));
const userProfiles = ref(readJson(USER_PROFILE_KEY, {}));
const draftSavedAt = ref('');

const trendChartRef = ref();
const mixChartRef = ref();
const formRef = ref();
const importInput = ref();

const analyticsLoading = ref(false);
const recordsLoading = ref(false);
const saving = ref(false);
const importing = ref(false);
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
  dimension: settings.defaultDimension || 'month',
  period: getCurrentPeriod(settings.defaultDimension || 'month'),
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
const editingId = ref('');

const logFilters = reactive({
  userId: 'all',
  action: 'all',
  keyword: ''
});

const activeMeta = computed(() => navItems.find((item) => item.value === activeView.value) || navItems[0]);
const enabledChannelOptions = computed(() => channelOptions.filter((item) => settings.channels[item.value]));
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

const metricCards = computed(() => {
  const current = visibleSummary.value;
  return [
    { key: 'today', label: '今日收款金额', value: money(coreSummary.today.total.amount), note: `${coreSummary.today.total.people} 人 · 适合移动端首屏查看`, className: 'card-green' },
    { key: 'month', label: '本月收款金额', value: money(coreSummary.month.total.amount), note: `本月 ${coreSummary.month.total.people} 人`, className: 'card-blue' },
    { key: 'year', label: '本年收款金额', value: money(coreSummary.year.total.amount), note: `本年 ${coreSummary.year.total.people} 人`, className: 'card-amber' },
    { key: 'period', label: '当前筛选客单价', value: formatAverage(averageFromSummary(current)), note: buildDeltaNote(current.total.amount, visibleCompareSummary.value.total.amount), className: 'card-rose' }
  ];
});

const shareRows = computed(() => {
  const data = visibleSummary.value;
  const total = Math.max(Number(data.total.amount || 0), 0);
  return enabledChannelOptions.value.map((item) => {
    const amount = Number(data[item.value]?.amount || 0);
    return {
      key: item.value,
      label: item.label,
      value: amount,
      percent: total ? Math.round((amount / total) * 100) : 0
    };
  });
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
  for (const item of enabledChannelOptions.value) {
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

function saveUserProfiles() {
  writeJson(USER_PROFILE_KEY, userProfiles.value);
  addOperationLog('权限变更', '更新用户角色或启停状态');
}

function saveSettings() {
  writeJson(SETTINGS_KEY, settings);
  if (!settings.channels[form.channel]) form.channel = enabledChannelOptions.value[0]?.value || 'wechat';
  addOperationLog('系统配置', '更新渠道、门店或默认统计口径');
}

function switchView(view) {
  activeView.value = view;
  window.location.hash = view;
  if (view === 'dashboard') nextTick(renderCharts);
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
  recordFilters.period = nextValue === 'month' ? getCurrentPeriod('year') : getCurrentPeriod('month');
  refreshRecords();
}

function handleAnalyticsDimensionChange(nextValue) {
  analytics.period = getCurrentPeriod(nextValue);
  if (nextValue === 'year' && analytics.years.length === 0) analytics.years = defaultCompareYears();
  refreshAnalytics();
}

function handleYearSelectionChange() {
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

  if (!users.value.some((item) => item.id === currentUserId.value && userProfile(item.id).status !== 'disabled')) {
    currentUserId.value = users.value.find((item) => userProfile(item.id).status !== 'disabled')?.id || DEFAULT_USER_ID;
  }
  setActiveUserId(currentUserId.value);
  localStorage.setItem(USER_STORAGE_KEY, currentUserId.value);
}

async function handleUserChange(userId) {
  currentUserId.value = userId || DEFAULT_USER_ID;
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
    const user = await userApi.create({ name });
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

async function refreshAll() {
  await Promise.all([refreshAnalytics(), refreshRecords()]);
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
      yearCompareSummaries.value = years.map((year, index) => ({ period: year, summary: summaryResults[index]?.summary || createSummaryState() }));
      trendRows.value = Array.isArray(trendData) ? trendData : [];
      const current = yearCompareSummaries.value.find((item) => item.period === getCurrentPeriod('year')) || yearCompareSummaries.value.at(-1);
      const previous = yearCompareSummaries.value.find((item) => item.period === String(Number(current?.period || 0) - 1)) || yearCompareSummaries.value[0];
      assignSummary(summary, current?.summary);
      assignSummary(compareSummary, previous?.summary);
    } else {
      const [summaryData, compareData, trendData] = await Promise.all([
        receiptApi.summary({ dimension: analytics.dimension, period: analytics.period }),
        receiptApi.summary({ dimension: analytics.dimension, period: comparePeriod(analytics.dimension, analytics.period) }),
        receiptApi.trend({ dimension: analytics.dimension, parentPeriod: getParentPeriod(analytics.dimension, analytics.period) || undefined })
      ]);
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
  recordsLoading.value = true;
  try {
    const list = await receiptApi.list({
      granularity: recordFilters.granularity,
      parentPeriod: recordFilters.period || undefined,
      channel: recordFilters.channel === 'all' ? undefined : recordFilters.channel
    });
    records.value = Array.isArray(list) ? list : [];
    pagination.currentPage = 1;
    selectedRows.value = [];
  } catch (error) {
    ElMessage.error(error.message || '刷新台账失败');
  } finally {
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
    ...enabledChannelOptions.value.map((item) => ({
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

function renderTrendChart() {
  const element = trendChartRef.value;
  if (!element) return;
  if (!trendChart) trendChart = echarts.init(element);
  const unit = analytics.metric === 'amount' ? '元' : '人';
  const rows = visibleTrendRows.value;
  const seriesFor = (channel) => rows.map((item) => Number(item.summary?.[channel]?.[analytics.metric] || 0));
  trendChart.setOption({
    color: ['#0f766e', '#2563eb', '#f97316', '#7c3aed', '#111827'],
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${value}${unit}` },
    legend: { top: 0, data: [...enabledChannelOptions.value.map((item) => item.label), '合计'] },
    grid: { top: 48, left: 12, right: 18, bottom: 14, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLabel: {
        formatter: (value) => {
          if (analytics.dimension === 'month') return value.slice(5);
          if (analytics.dimension === 'day') return value.slice(8);
          return value;
        }
      },
      data: rows.map((item) => item.period)
    },
    yAxis: { type: 'value', axisLabel: { formatter: (value) => `${value}${unit}` } },
    series: [
      ...enabledChannelOptions.value.map((item) => ({ name: item.label, type: 'line', smooth: true, data: seriesFor(item.value) })),
      { name: '合计', type: 'line', smooth: true, lineStyle: { type: 'dashed', width: 3 }, data: rows.map((item) => Number(item.summary?.total?.[analytics.metric] || 0)) }
    ]
  }, true);
  trendChart.resize();
}

function renderMixChart() {
  const element = mixChartRef.value;
  if (!element) return;
  if (!mixChart) mixChart = echarts.init(element);
  const total = shareRows.value.reduce((sum, item) => sum + Number(item.value || 0), 0);
  mixChart.setOption({
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
          data: shareRows.value.map((item) => ({ name: item.label, value: item.value }))
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
  await refreshAll();
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts);
  trendChart?.dispose();
  mixChart?.dispose();
});
</script>
