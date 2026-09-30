<script setup>
import { computed, reactive, ref } from 'vue';

const props = defineProps({
  form: { type: Object, required: true }, rules: { type: Object, required: true },
  enabledChannelOptions: { type: Array, required: true }, entryGranularityOptions: { type: Array, required: true },
  entryPicker: { type: Object, required: true }, saving: Boolean, editingId: String,
  draftSavedAt: String, periodValid: Boolean
});
const emit = defineEmits(['field-change', 'granularity-change', 'save', 'clear']);
const localForm = ref();
// 表单值由父层持有，子组件只发出字段变更和提交事件。
const fields = reactive(Object.fromEntries(
  ['granularity', 'channel', 'period', 'amount', 'people', 'remark', 'attachmentStatus'].map((field) => [field, computed({
    get: () => props.form[field], set: (value) => emit('field-change', { field, value })
  })])
));
const handleFormGranularityChange = (value) => emit('granularity-change', value);
const submitForm = (value) => emit('save', value);
const clearEntryForm = () => emit('clear');
defineExpose({ validate: () => localForm.value.validate(), clearValidate: () => localForm.value?.clearValidate() });
</script>

<template>
<section class="panel form-panel">
            <div class="panel-heading">
              <div>
                <span class="eyebrow">Entry</span>
                <h2>{{ editingId ? '编辑收款' : '新建收款' }}</h2>
              </div>
              <el-tag v-if="draftSavedAt" type="info">草稿 {{ draftSavedAt }}</el-tag>
            </div>
            <el-form ref="localForm" :model="form" :rules="rules" label-position="top" class="entry-form" :disabled="saving">
              <div class="form-grid">
                <el-form-item label="统计粒度" prop="granularity">
                  <el-segmented v-model="fields.granularity" :options="entryGranularityOptions" @change="handleFormGranularityChange" />
                </el-form-item>
                <el-form-item label="收款渠道" prop="channel">
                  <el-select v-model="fields.channel" class="full-control">
                    <el-option v-for="item in enabledChannelOptions" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </el-form-item>
                <el-form-item label="收款日期" prop="period">
                  <el-date-picker
                    v-model="fields.period"
                    :type="entryPicker.type"
                    :format="entryPicker.format"
                    :value-format="entryPicker.valueFormat"
                    :placeholder="entryPicker.placeholder"
                    class="full-control"
                    :editable="false"
                  />
                </el-form-item>
                <el-form-item label="收款金额" prop="amount">
                  <el-input-number v-model="fields.amount" :min="0" :precision="2" :step="100" class="full-control" />
                </el-form-item>
                <el-form-item label="收款人数" prop="people">
                  <el-input-number v-model="fields.people" :min="0" :precision="0" :step="1" class="full-control" />
                </el-form-item>
                <el-form-item label="附件状态">
                  <el-select v-model="fields.attachmentStatus" class="full-control">
                    <el-option label="无附件" value="none" />
                    <el-option label="已上传" value="uploaded" />
                    <el-option label="待补充" value="pending" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="备注 / 异常说明">
                <el-input v-model="fields.remark" type="textarea" :rows="4" maxlength="200" show-word-limit placeholder="可填写活动、退款、异常波动等说明" />
              </el-form-item>
            </el-form>
            <div class="mobile-entry-checks">
              <strong>录入校验</strong>
              <ul class="check-list">
                <li :class="{ pass: Number(form.amount) > 0 }">金额必须大于 0</li>
                <li :class="{ pass: Number.isInteger(Number(form.people)) && Number(form.people) >= 0 }">人数不可为负</li>
                <li :class="{ pass: periodValid }">日期不可超出允许范围</li>
                <li :class="{ pass: Boolean(form.channel) }">渠道来自启用配置</li>
              </ul>
            </div>
            <div class="form-actions entry-actions">
              <el-popconfirm title="确认清空当前填写内容吗？" @confirm="clearEntryForm">
                <template #reference><el-button class="clear-entry-button" :disabled="saving" text type="danger">清空内容</el-button></template>
              </el-popconfirm>
              <el-button class="save-entry-button" :loading="saving" @click="submitForm(false)">保存</el-button>
              <el-button class="continue-entry-button" type="primary" :loading="saving" @click="submitForm(true)">保存并继续</el-button>
            </div>
          </section>
</template>
