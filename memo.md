# 2025-08-18 11:24:02

### show storage usage
```javascript
navigator.storage.estimate().then(estimate => {
  console.log(`사용 중: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`총 할당량: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
});
```


```sql
SELECT SESN_YR
  FROM MA_ARTICLE_M
 WHERE ARTICLE_CD IN (
    'CL1726005'
    ,'CL1726002'
    ,'CL1726003'
    ,'CL1726004'
    ,'CL1726001'
)
;
```