import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64

fig = plt.figure(figsize=(10, 10))
ax1 = fig.add_subplot(2, 1, 1)
ax1.plot([1, 2], [3, 4])
ax1.set_title("Plot 1")

# Simulate something creating a new figure and making it active
fig2 = plt.figure()
plt.plot([1, 2], [10, 20])
plt.title("Plot 2")

# If we do plt.savefig, it saves fig2
buf1 = io.BytesIO()
plt.savefig(buf1, format='png')
buf1.seek(0)
with open('test_plt.png', 'wb') as f:
    f.write(buf1.read())

# If we do fig.savefig, it saves fig
buf2 = io.BytesIO()
fig.savefig(buf2, format='png')
buf2.seek(0)
with open('test_fig.png', 'wb') as f:
    f.write(buf2.read())
