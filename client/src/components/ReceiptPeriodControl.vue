<script setup>
import { computed } from 'vue';
import { ArrowDown, ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps({
  granularity: { type: String, required: true },
  picker: { type: Object, required: true },
  minPeriod: { type: String, required: true },
  maxPeriod: { type: String, required: true },
  disabled: Boolean
});
const period = defineModel({ type: [String, null], required: true });

function adjacentPeriod(offset) {
  if (!period.value) return null;
  const month = props.granularity === 'month';
  const date = new Date(`${period.value}${month ? '-01' : ''}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    console.error('录入周期格式不正确，无法快捷切换', { period: period.value, granularity: props.granularity });
    return null;
  }
  // 按日历日期切换，避免跨月、闰年及夏令时影响。
  if (month) date.setUTCMonth(date.getUTCMonth() + offset);
  else date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, month ? 7 : 10);
}

const previous = computed(() => adjacentPeriod(-1));
const next = computed(() => adjacentPeriod(1));
const previousLabel = computed(() => props.granularity === 'month' ? '上个月' : '前一天');
const nextLabel = computed(() => props.granularity === 'month' ? '下个月' : '后一天');
const inRange = (value) => Boolean(value) && value >= props.minPeriod && value <= props.maxPeriod;

function shiftPeriod(value) {
  if (!props.disabled && inRange(value)) period.value = value;
}

function disabledDate(date) {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const value = props.granularity === 'month' ? month : `${month}-${String(date.getDate()).padStart(2, '0')}`;
  return !inRange(value);
}
</script>

<template>
  <div class="entry-period-control">
    <el-button class="period-step" :icon="ArrowLeft" :aria-label="previousLabel" :title="previousLabel" :disabled="disabled || !inRange(previous)" @click="shiftPeriod(previous)" />
    <div class="period-picker">
      <el-date-picker
        v-model="period" :type="picker.type" :format="picker.format" :value-format="picker.valueFormat"
        :placeholder="picker.placeholder" :disabled="disabled" :disabled-date="disabledDate"
        :editable="false" :clearable="false" class="full-control"
      />
      <el-icon class="period-caret"><ArrowDown /></el-icon>
    </div>
    <el-button class="period-step" :icon="ArrowRight" :aria-label="nextLabel" :title="nextLabel" :disabled="disabled || !inRange(next)" @click="shiftPeriod(next)" />
  </div>
</template>

<style scoped>
.entry-period-control {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fff;
}
.entry-period-control .period-step {
  width: 100%;
  height: 36px;
  min-height: 36px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.period-step:first-child { border-right: 1px solid var(--line); }
.period-step:last-child { border-left: 1px solid var(--line); }
.period-picker { position: relative; min-width: 0; }
.period-picker :deep(.el-date-editor) { width: 100%; height: 36px; min-height: 36px; }
.period-picker :deep(.el-input__wrapper) { min-height: 36px; padding: 0 26px 0 10px; border-radius: 0; box-shadow: none; }
.period-picker :deep(.el-input__prefix) { display: none; }
.period-picker :deep(.el-input__inner) { height: 36px; text-align: center; cursor: pointer; }
.period-caret { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
@media (max-width: 760px) {
  .entry-period-control { grid-template-columns: 34px minmax(0, 1fr) 34px; }
  .entry-period-control .period-step,
  .period-picker :deep(.el-date-editor),
  .period-picker :deep(.el-input__wrapper),
  .period-picker :deep(.el-input__inner) { height: 34px; min-height: 34px; }
}
</style>
