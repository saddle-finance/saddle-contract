currentSDLPerSecond = 1222486969324766943
frax3poolRewardsPerSecond = (2_000_000 * 1e18) / (2 * 4 * 7 * 24 * 60 * 60)
print("frax3poolRewardsPerSecond: ", frax3poolRewardsPerSecond)
newSDLPerSecond = currentSDLPerSecond + frax3poolRewardsPerSecond 
print("newSDLPerSecond: ", newSDLPerSecond)
rate = frax3poolRewardsPerSecond / newSDLPerSecond
print("rate: ", rate)
totalallocpoint = 202
fraxAlloc = (totalallocpoint * rate) / (1 - rate)
print("fraxAlloc: ", fraxAlloc)  #68.30230451846634
newtotal = totalallocpoint + fraxAlloc
print((.3778 / newtotal) * 100) 

#current a's
pid1 = 50
pid2 = 25
pid3 = 25
pid4 = 25
pid5 = 0
pid6 = 0
pid7 = 0
pid8 = 25
pid9 = 50
pid10 = 2
#array of pids
pids = [pid1, pid2, pid3, pid4, pid5, pid6, pid7, pid8, pid9, pid10]

print("pids:")
#function to add two pids
def newA(pid_array):
    for pid in pid_array:
        print ((pid * 270) / 202)

newA(pids)

pid11 = 68






