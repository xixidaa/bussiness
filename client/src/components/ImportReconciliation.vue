<script setup>
defineProps({ plan: { type: Object, required: true } });
const channelNames = { wechat: '微信', alipay: '支付宝', cash: '现金', other: '其他' };
const statusNames = { new: '新增', conflict: '需确认替换', duplicate: '重复导入，跳过', blocked: '日/月数据冲突', fileDuplicate: '文件内重复' };
const formatAmount = (value) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
</script>

<template>
  <section class="import-reconciliation" aria-label="导入差额核对">
    <h3>日期/周期与渠道差额核对</h3>
    <p>核对原始台账记录：新增 {{ plan.counts.new }} 行，需替换 {{ plan.counts.conflict }} 行，完全重复 {{ plan.counts.duplicate }} 行。完全重复的记录不会再次写入。</p>
    <p>差额 = 导入金额 − 同日期/周期、同粒度、同渠道的已有金额。日明细与月汇总分别核对，不能相加作为经营金额。</p>
    <div class="reconciliation-grid">
      <article v-for="row in plan.rows" :key="row.key" class="reconciliation-row" :class="{ 'has-conflict': row.status === 'conflict' || row.status === 'blocked' }">
        <div class="reconciliation-heading"><strong>{{ row.period }} · {{ channelNames[row.channel] }}</strong><span>{{ row.granularity === 'day' ? '日明细' : '月汇总' }}</span></div>
        <dl>
          <div><dt>已有金额</dt><dd>{{ formatAmount(row.existingAmount) }}</dd></div>
          <div><dt>导入金额</dt><dd>{{ formatAmount(row.incomingAmount) }}</dd></div>
          <div><dt>金额差额</dt><dd>{{ formatAmount(row.difference) }}</dd></div>
          <div><dt>已有 / 导入人数</dt><dd>{{ row.existingPeople }} / {{ row.incomingPeople }}</dd></div>
        </dl>
        <strong class="reconciliation-status">{{ statusNames[row.status] }}</strong>
        <p>{{ row.message }}</p>
        <p v-if="row.monthlyReference">现有 {{ row.monthlyReference.period }} 月汇总 {{ formatAmount(row.monthlyReference.amount) }}；请核对补录日明细后整月金额，避免月汇总被不完整的日明细替代。</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.import-reconciliation { margin: 20px 0; }
.import-reconciliation h3 { margin-bottom: 8px; }
.import-reconciliation p { color: #58677b; line-height: 1.6; overflow-wrap: anywhere; }
.reconciliation-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.reconciliation-row { min-width: 0; padding: 14px; border: 1px solid #dce5ef; border-radius: 12px; }
.reconciliation-row.has-conflict { border-color: #e6ad53; }
.reconciliation-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.reconciliation-heading span, .reconciliation-row dt { color: #617286; }
.reconciliation-row dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.reconciliation-row dd { margin: 4px 0 0; overflow-wrap: anywhere; }
.reconciliation-status { font-size: 13px; }
</style>
