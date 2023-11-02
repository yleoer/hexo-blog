---
title: 解决中文乱码
excerpt: 解决 ls、git 无法正常显示中文的问题。
tags:
  - ubuntu
categories: Linux
abbrlink: 76ae49e7
date: 2023-11-02 10:40:21
---

突然发现 `git log`、`git status` 和 `ls` 都不能正常显示中文，查找后用如下方法解决了问题。

## 解决 git status 中文乱码

```bash
git config --global core.quotepath false
```

## 解决 git log 中文乱码

```bash
git config --global i18n.commitEncoding UTF-8
git config --global i18n.logOutputEncoding UTF-8
```

## 解决 ls 中文乱码

修改 `.zshrc` 或 `.bashrc` 文件。

```bash
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
```