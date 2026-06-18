// tests/detect.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNaturalLanguage } from '../src/detect.mjs';

describe('isNaturalLanguage', () => {
  it('应检测中文为自然语言', () => {
    assert.equal(isNaturalLanguage('列出当前目录的文件'), true);
  });

  it('应检测混合中英文自然语言', () => {
    assert.equal(isNaturalLanguage('帮我安装 lodash 依赖'), true);
  });

  it('应检测多个单词的自然语言（不含命令特征）', () => {
    assert.equal(isNaturalLanguage('show me all files'), true);
  });

  it('应检测长句自然语言（不含特殊字符）', () => {
    assert.equal(isNaturalLanguage('what time is it'), true);
  });

  it('应将单单词视为命令', () => {
    assert.equal(isNaturalLanguage('ls'), false);
  });

  it('应将两个单词视为命令', () => {
    assert.equal(isNaturalLanguage('ls -la'), false);
  });

  it('应检测包含短横线的命令', () => {
    assert.equal(isNaturalLanguage('npm install'), false);
    assert.equal(isNaturalLanguage('git commit -m "msg"'), false);
  });

  it('应检测包含路径分隔符的输入', () => {
    assert.equal(isNaturalLanguage('cat /etc/hosts'), false);
    assert.equal(isNaturalLanguage('./run.sh'), false);
  });

  it('应检测包含管道和重定向的输入', () => {
    assert.equal(isNaturalLanguage('grep foo bar.txt | head'), false);
    assert.equal(isNaturalLanguage('echo hello > out.txt'), false);
  });

  it('应检测包含文件扩展名的输入', () => {
    assert.equal(isNaturalLanguage('cat file.txt'), false);
  });

  it('应正确处理空字符串', () => {
    assert.equal(isNaturalLanguage(''), false);
  });
});
